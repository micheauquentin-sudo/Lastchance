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
 * 5 minutes, indéfiniment, sans qu'aucun heartbeat n'arrive jamais.
 *
 * Ce que ça casse exactement — MESURÉ sur la définition vivante
 * d'`ops_workers_health()` (`20260805240000_worker_observability_scale.sql`),
 * et pas déduit du nom des drapeaux :
 *
 *   • `configured` passerait au VERT. Il ne teste que l'EXISTENCE des deux
 *     entrées du Vault, jamais leur contenu. Or c'est le SEUL signal que ce
 *     panneau-ci lit : la ligne afficherait « Cadence rapide active » et le
 *     bouton disparaîtrait. L'unique écran qui offre le remède déclarerait donc
 *     le travail fait.
 *   • `healthy` resterait FAUX, et il faut le dire : il exige un succès daté de
 *     moins de `tolerance_seconds` (900 s pour `jobs`, 1800 s pour
 *     `sync-contests`). L'objectif de service ne verdirait pas, et prétendre le
 *     contraire serait un argument plus fort que le mécanisme ne le porte.
 *   • Ce qui se perd est la RAISON. Elle passerait de `vault_missing` — qui
 *     nomme le geste à faire — à `heartbeat_stale` sous quinze minutes, c'est-à-
 *     dire « le worker ne répond plus » : l'opérateur irait alors regarder la
 *     route, la file, Vercel — partout sauf l'URL qu'il vient de poser.
 *
 * Le mal n'est donc pas une supervision verte, c'est une supervision qui cesse
 * de désigner sa cause pendant que l'écran d'à côté affirme le contraire.
 *
 * D'où le refus de tout ce qui n'est pas joignable depuis l'extérieur : `https`
 * exigé (le secret d'autorisation part dans un en-tête `Bearer` — en clair sur
 * `http`), et hôte ni de boucle locale ni d'un réseau privé.
 *
 * ── La garde que la précédente ne portait PAS : « joignable » ≠ « nous » ──
 *
 * Les règles ci-dessus valident qu'un hôte est PUBLIC. Elles ne valident pas
 * que c'est LE NÔTRE — et `https://exemple-tiers.test` les passe toutes.
 *
 * Le scénario n'est pas théorique : un déploiement de PREVIEW porte le même
 * code, le même back-office et le même `CRON_SECRET` de production. Un
 * administrateur qui arme la cadence depuis une preview fait écrire dans le
 * Vault l'URL de cette preview ; Postgres émet alors, 288 fois par jour,
 * `Authorization: Bearer <CRON_SECRET de production>` vers un hôte qui n'est
 * pas la production. C'est une exfiltration CONTINUE du jeton qui ouvre les dix
 * routes `/api/cron/` — dont la purge RGPD et les résiliations d'essai. Et le
 * drapeau `configured` passe au vert, donc le bouton DISPARAÎT : l'écran du
 * remède déclare le travail fait, et la réparation ne se fait plus que par la
 * console SQL.
 *
 * `checkCadenceEnvironment` ferme cela. Ce qu'elle couvre, et ce qu'elle NE
 * couvre PAS — les deux se disent, parce qu'une garde défendue par un argument
 * trop fort est une garde qu'on retire le jour où l'argument tombe :
 *
 *   • COUVERT — l'environnement. `VERCEL_ENV` vaut `production`, `preview` ou
 *     `development`, et est absente hors Vercel. Tout ce qui n'est pas
 *     `production` est refusé.
 *
 *     Que ces variables système soient bien exposées à l'exécution est INFÉRÉ,
 *     et le mot compte. La rédaction précédente écrivait « MESURÉ » en
 *     s'appuyant sur `src/lib/release.ts`, qui lit `VERCEL_GIT_COMMIT_SHA`, de
 *     la même famille — mais ce module se replie en silence (`?? "dev"`), donc
 *     le fait que l'application compile et tourne ne prouve RIEN sur la
 *     présence de la variable. C'est un raisonnement par analogie, pas une
 *     observation.
 *
 *     Si l'inférence est fausse, la conséquence est BÉNIGNE : le bouton
 *     refuserait la vraie production avec `environnement_inconnu`, sans rien
 *     casser — les secrets Vault de production existent déjà et le pg_cron
 *     tourne. Un refus de trop ne coûte donc qu'un clic.
 *
 *     CE QUI SERAIT UNE VRAIE MESURE, faisable en cinq minutes par qui a la
 *     production sous la main : cliquer le bouton en production, puis lire la
 *     dernière ligne `monitoring.cadence.enable*` d'`admin_audit_logs`. Elle
 *     répond aux DEUX questions d'un coup, sans instrumentation à ajouter —
 *     `refusal = 'environnement_inconnu'` dit que `VERCEL_ENV` est absente à
 *     l'exécution ; toute autre issue dit qu'elle est présente, et le champ
 *     `production_host_verified` dit alors si
 *     `VERCEL_PROJECT_PRODUCTION_URL` l'est aussi.
 *   • COUVERT — l'`APP_URL` PÉRIMÉE, mais seulement si Vercel expose
 *     `VERCEL_PROJECT_PRODUCTION_URL` (le domaine de production du projet).
 *     C'est le seul angle qui attrape le cas d'une PRODUCTION dont le
 *     `NEXT_PUBLIC_APP_URL` pointe ailleurs — `VERCEL_ENV` seule le laisse
 *     passer, puisqu'elle dit bien `production`.
 *   • NON COUVERT, et c'est à dire — si `VERCEL_PROJECT_PRODUCTION_URL` est
 *     absente (variable plus récente que `VERCEL_ENV`, non vérifiée sur ce
 *     projet à l'exécution ; ou hébergement hors Vercel), la comparaison d'hôte
 *     ne peut pas avoir lieu et le refus se réduit à l'environnement. Une
 *     production au `NEXT_PUBLIC_APP_URL` périmé serait alors ARMÉE. Le fait est
 *     rendu (`hostChecked`) plutôt que tu : l'action le porte à l'audit, de
 *     sorte qu'on puisse relire APRÈS COUP si la garde forte a joué.
 *   • NON COUVERT — un déploiement qui se déclarerait lui-même `production`.
 *     Ces variables sont l'environnement de l'application : elles bornent une
 *     ERREUR d'exploitation, jamais quelqu'un qui possède déjà le déploiement.
 *
 * Module PUR : aucune I/O, aucun secret, `process.env` lu par l'APPELANT et
 * passé en argument. C'est ce qui permet de le tester exhaustivement, et
 * notamment de faire rougir le refus de `localhost` — la garde la plus facile à
 * supprimer par inadvertance « parce que ça marche en local ».
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
 * EST-CE BIEN NOUS ? — la garde d'environnement.
 *
 * Voir l'en-tête : `buildWorkerCronUrl` prouve qu'un hôte est PUBLIC, jamais
 * qu'il est le NÔTRE. Ce qui suit refuse d'armer depuis autre chose que la
 * production.
 * ════════════════════════════════════════════════════════════ */

/** Motif de refus d'environnement, stable et journalisable (jamais de valeur). */
export type CadenceEnvRefusal =
  | "environnement_inconnu"
  | "environnement_non_production"
  | "hote_hors_production";

/**
 * L'environnement, lu par l'appelant et passé ici — le module reste PUR.
 *
 * @param vercelEnv `VERCEL_ENV` : `production` | `preview` | `development`,
 *   absente hors Vercel (poste de développement, test unitaire).
 * @param productionHost `VERCEL_PROJECT_PRODUCTION_URL` : le domaine de
 *   production du projet, SANS schéma (`lastchance.app`). Peut être absente —
 *   c'est un cas prévu et rendu, pas une panne.
 */
export interface CadenceEnvironment {
  vercelEnv: string | undefined;
  productionHost: string | undefined;
}

export type CadenceEnvCheck =
  /**
   * `hostChecked` dit si la garde FORTE — celle qui attrape une `APP_URL`
   * périmée sur une vraie production — a pu jouer. À `false`, seul
   * l'environnement a été vérifié. Le distinguer d'un `true` est tout l'objet
   * du drapeau : un « autorisé » sans nuance laisserait croire à une garde qui
   * n'a pas eu lieu.
   */
  | { ok: true; hostChecked: boolean }
  | { ok: false; refusal: CadenceEnvRefusal; error: string };

/**
 * Ramène `VERCEL_PROJECT_PRODUCTION_URL` à un hôte comparable.
 *
 * Vercel la documente comme un domaine NU. On tolère quand même un schéma, un
 * chemin ou un port : la variable est parfois recopiée à la main dans un
 * environnement local, et refuser sur cette forme ferait passer la garde forte
 * à `false` — c'est-à-dire l'affaiblir — pour une simple différence d'écriture.
 */
function normalizeProductionHost(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const sansSchema = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const hote = sansSchema.split(/[/?#]/)[0].replace(/:\d+$/, "");
  return hote.toLowerCase() || null;
}

/**
 * Armer la cadence est-il légitime DEPUIS CE DÉPLOIEMENT ?
 *
 * Les messages de refus nomment les VARIABLES à regarder, jamais les valeurs
 * comparées : le motif part dans `admin_audit_logs` et doit rester une
 * étiquette fermée, et l'administrateur a besoin de savoir OÙ regarder, pas de
 * relire un hôte qu'il a déjà sous les yeux.
 */
export function checkCadenceEnvironment(
  env: CadenceEnvironment,
  appUrl: string,
): CadenceEnvCheck {
  const vercelEnv = env.vercelEnv?.trim().toLowerCase();

  if (!vercelEnv) {
    return {
      ok: false,
      refusal: "environnement_inconnu",
      error:
        "Cadence refusée : ce déploiement ne dit pas dans quel environnement il tourne (VERCEL_ENV absente — poste de développement, ou hébergement hors Vercel). "
        + "Le secret des crons serait posé dans le Vault de la base pointée par cet environnement-ci. Armez la cadence depuis le déploiement de production.",
    };
  }

  if (vercelEnv !== "production") {
    return {
      ok: false,
      refusal: "environnement_non_production",
      error:
        `Cadence refusée : ce déploiement est un environnement « ${vercelEnv} », pas la production. `
        + "Postgres appellerait cet hôte-ci toutes les 5 minutes en lui présentant le CRON_SECRET de production — qui ouvre les dix routes /api/cron/, dont la purge RGPD — et le panneau afficherait « cadence active » en faisant disparaître ce bouton. "
        + "Rouvrez cette page sur le domaine de production.",
    };
  }

  const productionHost = normalizeProductionHost(env.productionHost);
  if (!productionHost) {
    /* Garde forte inapplicable : la variable n'est pas exposée. On ne bloque
     * PAS pour autant — ce serait rendre la cadence inarmable partout où
     * `VERCEL_PROJECT_PRODUCTION_URL` n'existe pas, pour un risque que
     * `VERCEL_ENV` couvre déjà en grande partie. Le trou restant est NOMMÉ
     * (`hostChecked: false`) et part à l'audit. */
    return { ok: true, hostChecked: false };
  }

  let appHost: string;
  try {
    appHost = new URL(appUrl).hostname.toLowerCase();
  } catch {
    /* URL illisible : `buildWorkerCronUrl` la refusera juste après avec un
     * motif qui NOMME le vrai problème. Inventer ici un « hôte hors
     * production » enverrait l'administrateur comparer deux domaines alors que
     * la valeur n'est même pas une URL. */
    return { ok: true, hostChecked: false };
  }

  if (appHost !== productionHost) {
    return {
      ok: false,
      refusal: "hote_hors_production",
      error:
        "Cadence refusée : l'URL publique configurée (NEXT_PUBLIC_APP_URL) ne désigne pas le domaine de production de ce projet (VERCEL_PROJECT_PRODUCTION_URL). "
        + "C'est le cas d'une valeur périmée après un changement de domaine : Postgres émettrait le CRON_SECRET vers l'ancien hôte toutes les 5 minutes. "
        + "Alignez NEXT_PUBLIC_APP_URL sur le domaine de production. Si ce projet sert légitimement plusieurs domaines de production, corrigez cette comparaison — ne la retirez pas.",
    };
  }

  return { ok: true, hostChecked: true };
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
 * Module PUR, comme les gardes ci-dessus. Le motif d'origine — « ce dépôt n'a
 * pas d'environnement de rendu React » — a cessé d'être vrai le 2026-08-04 ;
 * la règle, elle, tient pour une raison qui ne dépendait pas de lui : une
 * décision extraite se teste sur ses entrées, sans monter d'écran ni simuler
 * l'administration entière.
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
  /**
   * Les AUTRES workers dont une entrée de Vault serait réécrite par ce même
   * clic. Des NOMS DE WORKERS, jamais des noms d'entrées : voir ci-dessous.
   */
  alsoAffects: string[];
}

/**
 * Les autres workers qui partagent au moins une entrée de Vault avec celui-ci.
 *
 * `ops_worker_definitions` donne à `jobs` ET à `sync-contests` le même
 * `vault_shared_secret`. Activer l'un RÉÉCRIT donc l'entrée de l'autre. Le
 * partage est voulu — une seule `CRON_SECRET` authentifie toutes les routes de
 * cron, et une entrée par worker donnerait N valeurs à faire tourner ensemble
 * pour une seule — mais rien à l'écran ne le disait : l'administrateur touchait
 * un second worker sans l'apprendre.
 *
 * Deux précisions qui ne sont pas des détails :
 *
 *  • Le calcul part du REGISTRE, jamais d'une paire écrite en dur. Le jour où
 *    le partage change, la phrase change avec lui.
 *  • Ce qui sort d'ici sont des noms de WORKERS (`sync-contests`), pas des noms
 *    d'entrées du Vault (`sync_contests_secret`). Ces derniers ne sortent
 *    d'aucune ligne de ce module, et un test le vérifie.
 *
 * L'information est calculée ICI, côté serveur, et affichée AVANT le clic —
 * plutôt qu'après, dans le retour de l'action : le panneau recharge la page au
 * succès (`reloadOnSuccess`), donc tout message post-clic serait effacé au
 * moment même où il apparaît. La RPC rend le même fait (`also_affects_workers`)
 * et c'est CETTE valeur-là, calculée en base au moment de l'écriture, qui part
 * à l'audit.
 */
function otherWorkersSharingVaultEntries(
  definition: WorkerCadenceDefinition,
  definitions: readonly WorkerCadenceDefinition[],
): string[] {
  const noms = new Set(
    [definition.vaultUrlSecret, definition.vaultSharedSecret].filter(
      (nom): nom is string => nom !== null,
    ),
  );
  if (noms.size === 0) return [];
  return definitions
    .filter(
      (autre) =>
        autre.worker !== definition.worker
        && ((autre.vaultUrlSecret !== null && noms.has(autre.vaultUrlSecret))
          || (autre.vaultSharedSecret !== null && noms.has(autre.vaultSharedSecret))),
    )
    .map((autre) => autre.worker)
    .sort((a, b) => a.localeCompare(b, "fr"));
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
 * @param definitions LE REGISTRE ENTIER, et pas seulement les lignes armables.
 *   Le filtre d'affichage est appliqué ICI (`vaultUrlSecret !== null`), mais le
 *   calcul des voisins a besoin de TOUTES les lignes : un worker qui n'aurait
 *   que `vaultSharedSecret` est bel et bien réécrit par le clic, et la RPC le
 *   nomme. Filtrer en amont ferait sous-déclarer l'avertissement pré-clic.
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

      const alsoAffects = otherWorkersSharingVaultEntries(definition, definitions);

      if (configured === true) {
        return {
          worker: definition.worker,
          state: "rapide" as const,
          cadence: `toutes les ${period}, par pg_cron`,
          consequence: fast,
          actionable: false,
          alsoAffects,
        };
      }

      if (configured === false) {
        return {
          worker: definition.worker,
          state: "quotidienne" as const,
          cadence: "une fois par jour seulement, par le cron Vercel",
          consequence: slow,
          actionable: complete,
          alsoAffects,
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
        alsoAffects,
      };
    });
}
