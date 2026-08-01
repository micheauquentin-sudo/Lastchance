import { describe, expect, it } from "vitest";

import { buildWorkerCronUrl } from "./worker-cadence";
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
