import { describe, expect, it } from "vitest";

import {
  buildWorkerCadenceRows,
  buildWorkerCronUrl,
  checkCadenceEnvironment,
  formatPeriod,
  type WorkerCadenceDefinition,
  type WorkerCadenceRow,
} from "./worker-cadence";
import { WORKER_NAMES, cronRoutePath } from "@/lib/worker-health";

/**
 * LA GARDE QU'ON SUPPRIME « PARCE QUE ÇA MARCHE EN LOCAL ».
 *
 * `APP_URL` vaut `http://localhost:3000` par défaut. Poser cette valeur dans le
 * Vault ferait appeler `localhost` par Postgres toutes les 5 minutes, sans
 * qu'aucun heartbeat n'arrive jamais.
 *
 * Ce qui casse alors, MESURÉ sur la définition vivante d'`ops_workers_health()`
 * (`20260805240000`) plutôt que déduit du nom des drapeaux — et il faut le dire
 * exactement, parce qu'une garde défendue par un argument trop fort est une
 * garde qu'on retire le jour où l'argument est réfuté :
 *
 *   • `configured` passerait au VERT — il ne teste que l'EXISTENCE des deux
 *     entrées, jamais leur contenu. C'est le seul signal que lit le panneau de
 *     cadence : la ligne dirait « Cadence rapide active » et le bouton
 *     disparaîtrait. L'unique écran qui offre le remède déclarerait le travail
 *     fait.
 *   • `healthy` resterait FAUX : il exige un succès de moins de
 *     `tolerance_seconds` (900 s pour `jobs`). L'objectif de service ne
 *     verdirait PAS, et prétendre le contraire serait faux.
 *   • Ce qui se perd est la RAISON : `vault_missing`, qui nomme le geste à
 *     faire, deviendrait `heartbeat_stale` en moins de quinze minutes — soit
 *     « le worker ne répond plus », qui envoie chercher la panne partout sauf
 *     dans l'URL qu'on vient de poser.
 *
 * Chaque refus ci-dessous a donc son assertion propre : retirer une branche
 * d'`estHotePublic` ou le test `https` fait rougir ce fichier, et pas seulement
 * un cas générique « URL invalide ».
 */

const PROD = "https://lastchance.app";

describe("URL de cadence rapide — ce qui est ACCEPTÉ", () => {
  it("dérive /api/cron/<worker> depuis l'origine de production", () => {
    const r = buildWorkerCronUrl("jobs", PROD);
    expect(r).toEqual({ ok: true, url: "https://lastchance.app/api/cron/jobs" });
  });

  it("réutilise la correspondance worker → route, sans la redevinier", () => {
    // ROUGE SI : quelqu'un recopie `/api/cron/` dans le module au lieu
    // d'appeler `cronRoutePath`. Le jour où une route change de préfixe, le
    // Vault porterait une URL en 404 que personne ne relit jamais.
    for (const worker of WORKER_NAMES) {
      const r = buildWorkerCronUrl(worker, PROD);
      expect(r.ok && r.url).toBe(`${PROD}${cronRoutePath(worker)}`);
    }
  });

  it("ne retient que l'ORIGINE : chemin, requête et fragment sont jetés", () => {
    const r = buildWorkerCronUrl("jobs", "https://lastchance.app/dashboard?x=1#z");
    expect(r.ok && r.url).toBe("https://lastchance.app/api/cron/jobs");
  });

  it("accepte un port explicite sur un hôte public", () => {
    const r = buildWorkerCronUrl("jobs", "https://ops.lastchance.app:8443");
    expect(r.ok && r.url).toBe("https://ops.lastchance.app:8443/api/cron/jobs");
  });
});

describe("URL de cadence rapide — LE REFUS DE LOCALHOST", () => {
  /**
   * Chaque forme est testée séparément : `localhost` seul ne couvre pas
   * `127.0.0.2`, que `/^127\./` attrape et qu'une garde écrite
   * `hostname === "127.0.0.1"` laisserait passer.
   */
  const locaux = [
    "https://localhost",
    "https://localhost:3000",
    "https://LOCALHOST:3000",
    "https://localhost.localdomain",
    "https://api.localhost",
    "https://127.0.0.1:3000",
    "https://127.0.0.2",
    "https://0.0.0.0",
    "https://[::1]:3000",
    "https://[::]",
    "https://poste.local",
  ];
  for (const url of locaux) {
    it(`refuse ${url}`, () => {
      const r = buildWorkerCronUrl("jobs", url);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.refusal).toBe("url_non_publique");
    });
  }

  it("nomme le vrai risque dans le message : configuré sans jamais tourner", () => {
    const r = buildWorkerCronUrl("jobs", "https://localhost:3000");
    expect(!r.ok && r.error).toContain("sans jamais tourner");
  });
});

describe("URL de cadence rapide — les réseaux privés", () => {
  const prives = [
    "https://10.0.0.4",
    "https://192.168.1.10",
    "https://172.16.0.1",
    "https://172.31.255.254",
    "https://169.254.169.254", // métadonnées d'instance
    "https://[fd00::1]",
    "https://[fe80::1]",
  ];
  for (const url of prives) {
    it(`refuse ${url}`, () => {
      expect(buildWorkerCronUrl("jobs", url).ok).toBe(false);
    });
  }

  it("n'attrape PAS une plage voisine réellement publique", () => {
    // 172.32.x est public : une garde écrite `/^172\./` casserait ici.
    expect(buildWorkerCronUrl("jobs", "https://172.32.0.1").ok).toBe(true);
    expect(buildWorkerCronUrl("jobs", "https://11.0.0.1").ok).toBe(true);
  });
});

describe("URL de cadence rapide — le transport", () => {
  it("refuse http : le secret voyage dans un en-tête Authorization", () => {
    const r = buildWorkerCronUrl("jobs", "http://lastchance.app");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal).toBe("url_non_https");
  });

  it("refuse un schéma exotique", () => {
    expect(buildWorkerCronUrl("jobs", "ftp://lastchance.app").ok).toBe(false);
  });

  it("refuse une chaîne illisible plutôt que de lever", () => {
    const r = buildWorkerCronUrl("jobs", "pas une url");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal).toBe("url_illisible");
  });

  it("refuse une valeur vide", () => {
    expect(buildWorkerCronUrl("jobs", "").ok).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════
 * « JOIGNABLE » N'EST PAS « NOUS » — la garde d'environnement.
 *
 * `buildWorkerCronUrl` accepte `https://exemple-tiers.test` : il est public,
 * et c'est tout ce qu'elle sait dire. Une PREVIEW porte le même code, le même
 * back-office et le même `CRON_SECRET` de production ; armer depuis elle fait
 * émettre par Postgres `Bearer <CRON_SECRET de production>` 288 fois par jour
 * vers un hôte qui n'est pas la production — et fait passer `configured` au
 * vert, donc DISPARAÎTRE le bouton qui répare.
 * ══════════════════════════════════════════════════════════ */

const PROD_HOST = "lastchance.app";

describe("garde d'environnement — armer depuis autre chose que la production", () => {
  it("refuse une PREVIEW, et le dit assez pour qu'on ne croie pas à une panne", () => {
    const r = checkCadenceEnvironment(
      { vercelEnv: "preview", productionHost: PROD_HOST },
      "https://ma-branche-abc123.vercel.app",
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal).toBe("environnement_non_production");
    // L'administrateur doit comprendre POURQUOI : l'environnement nommé, le
    // risque nommé, et le geste à faire.
    expect(!r.ok && r.error).toContain("preview");
    expect(!r.ok && r.error).toMatch(/CRON_SECRET/);
    expect(!r.ok && r.error).toMatch(/production/);
  });

  it("refuse un environnement de développement", () => {
    const r = checkCadenceEnvironment(
      { vercelEnv: "development", productionHost: PROD_HOST },
      `https://${PROD_HOST}`,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal).toBe("environnement_non_production");
  });

  it("refuse quand VERCEL_ENV est ABSENTE — un poste local n'arme rien", () => {
    // ROUGE SI : quelqu'un traite l'absence comme « probablement la prod ». Sur
    // un poste de développement la variable n'existe pas ; le défaut doit être
    // le refus, jamais l'inverse.
    const r = checkCadenceEnvironment(
      { vercelEnv: undefined, productionHost: undefined },
      `https://${PROD_HOST}`,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal).toBe("environnement_inconnu");
  });

  it("accepte la production dont l'URL publique EST le domaine de production", () => {
    const r = checkCadenceEnvironment(
      { vercelEnv: "production", productionHost: PROD_HOST },
      `https://${PROD_HOST}`,
    );
    expect(r).toEqual({ ok: true, hostChecked: true });
  });

  it("tolère les écritures de VERCEL_ENV : casse et espaces", () => {
    const r = checkCadenceEnvironment(
      { vercelEnv: " Production ", productionHost: PROD_HOST },
      `https://${PROD_HOST}`,
    );
    expect(r.ok).toBe(true);
  });
});

describe("garde d'environnement — l'APP_URL PÉRIMÉE, que VERCEL_ENV seule ne voit pas", () => {
  it("refuse une VRAIE production dont NEXT_PUBLIC_APP_URL pointe ailleurs", () => {
    // LE CAS QUE LA PREMIÈRE GARDE LAISSE PASSER : `VERCEL_ENV` dit bien
    // `production`, l'hôte est bien public et en https — et pourtant Postgres
    // émettrait le CRON_SECRET vers l'ancien domaine, indéfiniment.
    const r = checkCadenceEnvironment(
      { vercelEnv: "production", productionHost: PROD_HOST },
      "https://ancien-domaine.example",
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal).toBe("hote_hors_production");
    expect(!r.ok && r.error).toContain("NEXT_PUBLIC_APP_URL");
    expect(!r.ok && r.error).toContain("VERCEL_PROJECT_PRODUCTION_URL");
  });

  it("compare des HÔTES : schéma, port, chemin et casse ne font pas diverger", () => {
    // ROUGE SI : la comparaison devient une égalité de chaînes brutes. Vercel
    // documente un domaine NU ; une valeur recopiée à la main avec un schéma
    // ferait alors basculer la garde forte en garde faible, en silence.
    for (const brut of [
      PROD_HOST,
      `https://${PROD_HOST}`,
      `${PROD_HOST}/`,
      `${PROD_HOST}:443`,
      `LASTCHANCE.APP`,
    ]) {
      const r = checkCadenceEnvironment(
        { vercelEnv: "production", productionHost: brut },
        `https://${PROD_HOST}/dashboard`,
      );
      expect(r).toEqual({ ok: true, hostChecked: true });
    }
  });

  it("un sous-domaine n'est PAS le domaine de production", () => {
    const r = checkCadenceEnvironment(
      { vercelEnv: "production", productionHost: PROD_HOST },
      `https://staging.${PROD_HOST}`,
    );
    expect(r.ok).toBe(false);
  });
});

describe("garde d'environnement — CE QU'ELLE NE COUVRE PAS, dit et non tu", () => {
  it("sans VERCEL_PROJECT_PRODUCTION_URL, elle autorise en AVOUANT n'avoir pas comparé", () => {
    // La variable est plus récente que `VERCEL_ENV` et n'est pas garantie ici.
    // Bloquer rendrait la cadence inarmable ; autoriser en SILENCE laisserait
    // croire à une garde qui n'a pas eu lieu. On autorise et on le DIT :
    // l'action porte `hostChecked` à l'audit.
    const r = checkCadenceEnvironment(
      { vercelEnv: "production", productionHost: undefined },
      "https://n-importe-quoi.example",
    );
    expect(r).toEqual({ ok: true, hostChecked: false });
  });

  it("une variable vide vaut absente, jamais une comparaison contre la chaîne vide", () => {
    // ROUGE SI : `""` était comparé tel quel — tout hôte serait alors « hors
    // production » et la cadence deviendrait inarmable.
    const r = checkCadenceEnvironment(
      { vercelEnv: "production", productionHost: "   " },
      `https://${PROD_HOST}`,
    );
    expect(r).toEqual({ ok: true, hostChecked: false });
  });

  it("une APP_URL illisible n'est pas déguisée en « hôte hors production »", () => {
    // `buildWorkerCronUrl` la refusera juste après avec le motif qui nomme le
    // VRAI problème. Inventer ici un écart de domaine enverrait l'administrateur
    // comparer deux hôtes alors que la valeur n'est même pas une URL.
    const r = checkCadenceEnvironment(
      { vercelEnv: "production", productionHost: PROD_HOST },
      "pas une url",
    );
    expect(r).toEqual({ ok: true, hostChecked: false });
  });
});

describe("aucun refus ne recopie l'entrée", () => {
  it("le refus d'environnement ne recopie ni l'URL ni le domaine comparé", () => {
    // Le motif part dans `admin_audit_logs` : étiquette fermée, jamais une
    // valeur. Le message d'écran nomme les VARIABLES à regarder, pas les hôtes.
    const r = checkCadenceEnvironment(
      { vercelEnv: "production", productionHost: PROD_HOST },
      "https://ancien-domaine.example/chemin-secret",
    );
    expect(!r.ok && r.refusal).toBe("hote_hors_production");
    expect(!r.ok && r.error).not.toContain("ancien-domaine");
    expect(!r.ok && r.error).not.toContain("chemin-secret");
    expect(!r.ok && r.error).not.toContain(PROD_HOST);
  });

  it("le motif de refus est un code fermé, jamais l'URL reçue", () => {
    // Le motif part dans `admin_audit_logs` : il doit rester une étiquette
    // stable, pas une chaîne d'entrée qu'un POST fabriqué choisirait.
    const r = buildWorkerCronUrl("jobs", "https://192.168.1.10/secret-path");
    expect(!r.ok && r.refusal).toBe("url_non_publique");
    expect(!r.ok && r.error).not.toContain("192.168");
  });
});

/* ══════════════════════════════════════════════════════════
 * LES LIGNES DU PANNEAU — ce que l'écran dit, et ce qu'il tait.
 * ══════════════════════════════════════════════════════════ */

const REGISTRE: WorkerCadenceDefinition[] = [
  {
    worker: "jobs",
    expectedPeriodSeconds: 300,
    vaultUrlSecret: "jobs_worker_url",
    vaultSharedSecret: "sync_contests_secret",
  },
  {
    worker: "sync-contests",
    expectedPeriodSeconds: 600,
    vaultUrlSecret: "sync_contests_url",
    vaultSharedSecret: "sync_contests_secret",
  },
  {
    // Les six crons quotidiens du registre : aucun prérequis Vault.
    worker: "purge-data",
    expectedPeriodSeconds: 86400,
    vaultUrlSecret: null,
    vaultSharedSecret: null,
  },
];

const texte = (row: WorkerCadenceRow) => `${row.cadence} ${row.consequence}`;

describe("cadence des workers — le panneau est piloté par le REGISTRE", () => {
  it("n'affiche que les workers portant un secret d'URL", () => {
    // ROUGE SI : quelqu'un remplace le filtre par une liste en dur. `purge-data`
    // n'a aucune cadence rapide possible ; l'afficher offrirait un bouton qui
    // écrirait un secret que le planificateur ne lit jamais.
    const rows = buildWorkerCadenceRows(REGISTRE, new Map());
    expect(rows.map((r) => r.worker)).toEqual(["jobs", "sync-contests"]);
  });

  it("un worker AJOUTÉ au registre apparaît sans toucher à l'écran", () => {
    const rows = buildWorkerCadenceRows(
      [
        ...REGISTRE,
        {
          worker: "demain",
          expectedPeriodSeconds: 120,
          vaultUrlSecret: "demain_url",
          vaultSharedSecret: "demain_secret",
        },
      ],
      new Map([["demain", false]]),
    );
    const ajoute = rows.find((r) => r.worker === "demain");
    expect(ajoute).toBeDefined();
    // Repli générique, mais VRAI : pas de case vide, pas de phrase inventée.
    expect(ajoute!.consequence).toContain("24 h");
    expect(ajoute!.actionable).toBe(true);
  });

  it("dérive la période du registre, jamais d'un « 5 minutes » recopié", () => {
    const rows = buildWorkerCadenceRows(
      REGISTRE,
      new Map([
        ["jobs", true],
        ["sync-contests", true],
      ]),
    );
    expect(rows[0].cadence).toContain("5 minutes");
    expect(rows[1].cadence).toContain("10 minutes");
  });

  it("formate une période sans jamais parler en secondes", () => {
    expect(formatPeriod(300)).toBe("5 minutes");
    expect(formatPeriod(60)).toBe("1 minute");
    expect(formatPeriod(86400)).toBe("24 heures");
  });
});

describe("cadence des workers — l'écran dit la CONSÉQUENCE, pas un drapeau", () => {
  it("non configuré : cadence quotidienne, et ce qu'elle coûte au client", () => {
    // C'est tout l'intérêt du panneau : un administrateur qui lit « non
    // configuré » sans savoir ce que ça lui coûte ne cliquera jamais.
    const [jobs] = buildWorkerCadenceRows(REGISTRE, new Map([["jobs", false]]));
    expect(jobs.state).toBe("quotidienne");
    expect(jobs.cadence).toContain("une fois par jour");
    expect(jobs.consequence).toContain("24 h");
    expect(jobs.consequence).toMatch(/code de retrait/i);
    expect(jobs.actionable).toBe(true);
  });

  it("configuré : plus de bouton, et le gain est dit", () => {
    const [jobs] = buildWorkerCadenceRows(REGISTRE, new Map([["jobs", true]]));
    expect(jobs.state).toBe("rapide");
    expect(jobs.actionable).toBe(false);
    expect(jobs.consequence).toMatch(/minutes/);
  });

  it("worker non supervisé : « inconnue », jamais « quotidienne » par défaut", () => {
    // `ops_workers_health()` ne rend QUE les workers supervisés. Une ligne
    // absente n'est pas la preuve d'une cadence lente : l'écran ne doit pas
    // affirmer ce que personne ne mesure.
    const [jobs] = buildWorkerCadenceRows(REGISTRE, new Map());
    expect(jobs.state).toBe("inconnue");
    expect(jobs.actionable).toBe(true);
  });

  it("registre à moitié renseigné : pas de bouton qui échouerait au clic", () => {
    const [jobs] = buildWorkerCadenceRows(
      [{ ...REGISTRE[0], vaultSharedSecret: null }],
      new Map([["jobs", false]]),
    );
    expect(jobs.actionable).toBe(false);
  });
});

describe("cadence des workers — le clic touche un VOISIN, et l'écran le dit", () => {
  it("nomme les autres workers dont une entrée de Vault serait réécrite", () => {
    // `jobs` et `sync-contests` partagent `sync_contests_secret` : activer l'un
    // réécrit l'entrée de l'autre. Bénin aujourd'hui (même valeur), mais le
    // bouton ne le disait pas — l'administrateur touchait deux workers en
    // croyant n'en toucher qu'un.
    const rows = buildWorkerCadenceRows(
      REGISTRE,
      new Map([
        ["jobs", false],
        ["sync-contests", false],
      ]),
    );
    expect(rows.find((r) => r.worker === "jobs")!.alsoAffects).toEqual([
      "sync-contests",
    ]);
    expect(rows.find((r) => r.worker === "sync-contests")!.alsoAffects).toEqual([
      "jobs",
    ]);
  });

  it("ne nomme personne quand aucune entrée n'est partagée", () => {
    // ROUGE SI : le calcul devient une paire écrite en dur. Un registre où
    // chaque worker a ses propres entrées ne doit AVERTIR DE RIEN, sans quoi
    // l'avertissement cesse d'être un signal.
    const cloisonne: WorkerCadenceDefinition[] = [
      { ...REGISTRE[0], vaultSharedSecret: "jobs_secret" },
      { ...REGISTRE[1], vaultSharedSecret: "sync_contests_secret" },
    ];
    for (const row of buildWorkerCadenceRows(cloisonne, new Map())) {
      expect(row.alsoAffects).toEqual([]);
    }
  });

  it("un worker sans prérequis Vault n'est jamais compté comme voisin", () => {
    // `purge-data` porte deux `null`. Une comparaison naïve ferait matcher
    // `null === null` et l'annoncerait comme réécrit par chaque activation.
    const rows = buildWorkerCadenceRows(REGISTRE, new Map());
    for (const row of rows) {
      expect(row.alsoAffects).not.toContain("purge-data");
    }
  });
});

describe("cadence des workers — ce qui ne sort JAMAIS de l'écran", () => {
  it("ni l'URL, ni le secret, ni le nom des entrées du Vault", () => {
    // ROUGE SI : quelqu'un « aide au diagnostic » en affichant le nom du
    // secret. L'état se dit par oui/non, jamais par la valeur ni par la clé.
    const rows = buildWorkerCadenceRows(
      REGISTRE,
      new Map([
        ["jobs", false],
        ["sync-contests", true],
      ]),
    );
    for (const row of rows) {
      expect(texte(row)).not.toContain("jobs_worker_url");
      expect(texte(row)).not.toContain("sync_contests_secret");
      expect(texte(row)).not.toContain("sync_contests_url");
      expect(texte(row)).not.toContain("http");
    }
  });

  it("l'avertissement de partage nomme des WORKERS, jamais des entrées", () => {
    // ROUGE SI : quelqu'un rend le message plus « précis » en y mettant le nom
    // de l'entrée partagée. `sync-contests` est un nom de worker, déjà affiché
    // en titre de ligne ; `sync_contests_secret` est une clé du Vault, et rien
    // de ce module n'a à la faire sortir.
    const rows = buildWorkerCadenceRows(REGISTRE, new Map());
    for (const row of rows) {
      for (const voisin of row.alsoAffects) {
        expect(voisin).not.toContain("_");
        expect(REGISTRE.map((d) => d.worker)).toContain(voisin);
      }
    }
  });
});
