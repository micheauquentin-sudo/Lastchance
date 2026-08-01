import { describe, expect, it } from "vitest";

import {
  buildWorkerCadenceRows,
  buildWorkerCronUrl,
  formatPeriod,
  type WorkerCadenceDefinition,
  type WorkerCadenceRow,
} from "./worker-cadence";
import { WORKER_NAMES, cronRoutePath } from "@/lib/worker-health";

/**
 * LA GARDE QU'ON SUPPRIME « PARCE QUE ÇA MARCHE EN LOCAL ».
 *
 * `APP_URL` vaut `http://localhost:3000` par défaut. Poser cette valeur dans le
 * Vault ne produirait AUCUNE erreur visible : le pg_cron appellerait `localhost`
 * depuis Postgres toutes les 5 minutes, `net.http_get` échouerait en
 * arrière-plan, et le drapeau `configured` d'`ops_workers_health()` — qui ne
 * teste que l'EXISTENCE des secrets, jamais leur contenu — passerait au vert.
 * Le pire des deux mondes : la supervision croirait le worker configuré.
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

describe("aucun refus ne recopie l'entrée", () => {
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
});
