import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const CRON_SECRET = "secret-de-supervision";

/** Appel de SUPERVISION : porte `CRON_SECRET`, reçoit le détail (SEC-3). */
const requeteDetaillee = () =>
  new Request("https://app.example.com/api/health", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });

/** Appel PUBLIC : n'importe qui sur Internet, aucun en-tête. */
const requetePublique = (headers: Record<string, string> = {}) =>
  new Request("https://app.example.com/api/health", { headers });

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-key";
  process.env.CRON_SECRET = CRON_SECRET;
  // Aucune IP de confiance : le plafond de SEC-3 ne s'applique pas, et ces
  // cas-ci testent le corps, pas le débit.
  delete process.env.TRUSTED_PROXY_PROVIDER;
  delete process.env.VERCEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.ADMIN_HOSTS;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.CRON_SECRET;
  delete process.env.TRUSTED_PROXY_PROVIDER;
  delete process.env.VERCEL;
});

describe("GET /api/health", () => {
  it("200 et status ok quand la base répond", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    const res = await GET(requeteDetaillee());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.database.latency_ms).toBeGreaterThanOrEqual(0);
    expect(typeof body.uptime_s).toBe("number");
    expect(body.version).toBeTruthy();
    // Le drapeau Realtime est CONSTATABLE de l'extérieur : c'est le seul moyen
    // de vérifier qu'une variable posée chez l'hébergeur a bien pris — elle y
    // est stockée « Sensitive », donc illisible même par son propriétaire, et
    // la prop côté page n'existe que sur une session réelle.
    expect(typeof body.features.events_realtime).toBe("boolean");
  });

  it("503 quand la base est injoignable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connexion refusée")),
    );

    const res = await GET(requeteDetaillee());
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("unhealthy");
    expect(body.checks.database.status).toBe("error");
    expect(body.checks.database.error).toBe("connexion refusée");
  });

  it("503 quand la base répond en erreur HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    const res = await GET(requeteDetaillee());
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.checks.database.error).toBe("HTTP 500");
  });

  it("503 quand Supabase n'est pas configuré", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const res = await GET(requeteDetaillee());
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.checks.database.error).toBe("Supabase non configuré");
  });

  it("200 en production uniquement quand les deux workers sont sains", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    // Depuis I1, une production sans proxy déclaré est `unhealthy` : ses
    // plafonds par IP sont désarmés. Une production SAINE en déclare donc un.
    process.env.TRUSTED_PROXY_PROVIDER = "vercel";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/rest/v1/rpc/ops_workers_health")) {
          return Promise.resolve(
            Response.json([
              { worker: "jobs", healthy: true },
              { worker: "sync-contests", healthy: true },
            ]),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.workers.status).toBe("ok");
  });

  it("un worker NON fréquent en défaut reste 200, mais cesse d'être invisible", async () => {
    /* LE DÉFAUT QUE CE TEST FERME. La sonde filtrait les lignes sur les deux
     * workers fréquents et JETAIT tout le reste : une purge RGPD, un tirage
     * jackpot ou le rapport hebdomadaire pouvaient être rouges au registre
     * sans qu'aucune surface d'exploitation ne le dise.
     *
     * Le verdict, lui, ne bouge pas : un worker hebdomadaire muet dégrade la
     * supervision, il ne rend pas la plateforme indisponible. Faire basculer
     * la sonde en 503 apprendrait au moniteur à ignorer l'alarme — c'est ce
     * qu'explique le docstring de `FREQUENT_WORKERS`, et ce test l'exige. */
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    process.env.TRUSTED_PROXY_PROVIDER = "vercel";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        if (String(input).endsWith("/rest/v1/rpc/ops_workers_health")) {
          return Promise.resolve(
            Response.json([
              { worker: "jobs", healthy: true },
              { worker: "sync-contests", healthy: true },
              { worker: "weekly-digest", healthy: false },
              { worker: "purge-data", healthy: false },
            ]),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.workers.status).toBe("ok");
    expect(body.checks.workers.unhealthy_workers).toEqual([
      "weekly-digest",
      "purge-data",
    ]);
  });

  it("le corps PUBLIC ne nomme aucun worker, même en défaut", async () => {
    /* La liste nominative est de la topologie d'exploitation : quels
     * traitements de fond existent, et lequel est tombé. Même oracle de
     * posture que `security_configuration.error` (SEC-3), donc même côté de
     * `CRON_SECRET`. Sans cette garde, rendre le défaut visible reviendrait à
     * le rendre PUBLIC. */
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    process.env.TRUSTED_PROXY_PROVIDER = "vercel";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        if (String(input).endsWith("/rest/v1/rpc/ops_workers_health")) {
          return Promise.resolve(
            Response.json([
              { worker: "jobs", healthy: true },
              { worker: "sync-contests", healthy: true },
              { worker: "weekly-digest", healthy: false },
            ]),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const res = await GET(requetePublique());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("weekly-digest");
    expect(JSON.stringify(body)).not.toContain("unhealthy_workers");
  });

  it("503 en production sans exposer le détail du worker défaillant", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    // Déclaré pour que le worker soit la SEULE cause du 503 attendu ici.
    process.env.TRUSTED_PROXY_PROVIDER = "vercel";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/rest/v1/rpc/ops_workers_health")) {
          return Promise.resolve(
            Response.json([
              { worker: "jobs", healthy: true },
              { worker: "sync-contests", healthy: false },
            ]),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.workers).toEqual(
      expect.objectContaining({
        status: "error",
        error: "Workers non opérationnels",
        // NOMMÉ ICI, et seulement ici. Cette assertion disait auparavant
        // l'inverse — `not.toContain("sync-contests")` sur le corps DÉTAILLÉ —
        // et c'est ce qui rendait la panne muette pour celui-là même qui
        // prouve connaître `CRON_SECRET` pour la diagnostiquer. Le secret à
        // tenir est vis-à-vis du public, pas de l'exploitant : le cas
        // « corps PUBLIC » ci-dessus garde cette moitié-là.
        unhealthy_workers: ["sync-contests"],
      }),
    );

    const resPublique = await GET(requetePublique());
    expect(JSON.stringify(await resPublique.json())).not.toContain(
      "sync-contests",
    );
  });
});

describe("GET /api/health — l'IP client doit être mesurable en production (I1)", () => {
  const baseOk = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

  /**
   * Production correctement configurée, SAUF ce que chaque cas retire. En
   * production `checkWorkers` interroge réellement la RPC : sans réponse
   * exploitable, tous ces cas rendraient 503 pour la mauvaise raison.
   */
  const productionSaine = () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        if (String(input).endsWith("/rest/v1/rpc/ops_workers_health")) {
          return Promise.resolve(
            Response.json([
              { worker: "jobs", healthy: true },
              { worker: "sync-contests", healthy: true },
            ]),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );
  };

  it("503 en production quand aucun proxy de confiance n'est déclaré", async () => {
    // LE DÉFAUT QUE CE TEST FERME. `clientIpFromHeaders` ne lit une IP que
    // derrière un proxy DÉCLARÉ ; ailleurs elle vaut `unknown`. Or tous les
    // plafonds par IP du dépôt sont gardés par `ip !== IP_CLIENT_INCONNUE`
    // (ADR-032 : un seau sur `unknown` serait un interrupteur global). Un
    // changement d'hébergement les désarmait donc TOUS en silence — rien ne
    // casse, rien ne loggue, l'anti-abus disparaît sans une alarme.
    productionSaine();

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.security_configuration).toEqual({
      status: "error",
      error: "IP client non mesurable — plafonds par IP désarmés",
    });
  });

  it("200 dès qu'un proxy est déclaré explicitement", async () => {
    productionSaine();
    process.env.TRUSTED_PROXY_PROVIDER = "cloudflare";

    const res = await GET(requeteDetaillee());

    expect(res.status).toBe(200);
  });

  it("200 sur la plateforme, qui pose `VERCEL` elle-même", async () => {
    // Le déploiement nominal ne déclare rien à la main : c'est l'hébergeur qui
    // pose la variable. La garde doit l'accepter, sans quoi elle crierait en
    // permanence sur la seule configuration réellement utilisée.
    productionSaine();
    process.env.VERCEL = "1";

    const res = await GET(requeteDetaillee());

    expect(res.status).toBe(200);
  });

  it("hors production, l'absence de proxy n'est pas une faute", async () => {
    // En développement il n'y a ni proxy ni besoin de plafond : crier ici
    // rendrait la sonde rouge en permanence sur les postes, donc muette.
    baseOk();

    const res = await GET(requeteDetaillee());

    expect(res.status).toBe(200);
  });

  it("le corps PUBLIC ne nomme pas la faille de configuration", async () => {
    // Le verdict reste public ; sa cause ne l'est pas (SEC-3). Dire à un
    // inconnu « les plafonds par IP sont désarmés » serait le pire des oracles
    // — celui qui annonce que l'anti-abus est absent.
    productionSaine();

    const res = await GET(requetePublique());
    const corps = await res.text();

    expect(res.status).toBe(503);
    expect(corps).toContain("unhealthy");
    expect(corps).not.toContain("IP client");
    expect(corps).not.toContain("plafonds");
    expect(corps).not.toContain("security_configuration");
  });

  it("ADMIN_HOSTS garde la priorité dans le message", async () => {
    // Deux causes possibles : celle qui expose le back-office se nomme
    // d'abord. Un seul message, et c'est le plus grave qui sort.
    productionSaine();
    delete process.env.ADMIN_HOSTS;

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(body.checks.security_configuration.error).toBe("ADMIN_HOSTS manquant");
  });
});

describe("GET /api/health — le détail n'est pas public (SEC-3)", () => {
  const baseOk = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

  it("un appel public reçoit le verdict, et RIEN de plus", async () => {
    baseOk();

    const res = await GET(requetePublique());
    const body = await res.json();

    // Ce qui reste : de quoi surveiller. Un moniteur n'a besoin que du code
    // HTTP, et le drapeau Realtime doit rester constatable de l'extérieur.
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "features",
      "status",
      "timestamp",
      "version",
    ]);
  });

  it("l'oracle de POSTURE de sécurité ne fuit plus", async () => {
    // LE DÉFAUT QUE CE TEST FERME. « Protection anti-bot incomplète » disait à
    // un attaquant que Turnstile n'est pas en place AVANT qu'il tente quoi que
    // ce soit ; « ADMIN_HOSTS manquant » lui apprenait que le back-office n'est
    // pas cloisonné par domaine. Le tout sans aucune authentification.
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ADMIN_HOSTS;
    baseOk();

    const res = await GET(requetePublique());
    const corps = await res.text();

    // Le VERDICT reste public — c'est la raison d'être de la sonde.
    expect(res.status).toBe(503);
    expect(corps).toContain("unhealthy");
    // La CAUSE ne l'est plus.
    expect(corps).not.toContain("ADMIN_HOSTS");
    expect(corps).not.toContain("anti-bot");
    expect(corps).not.toContain("security_configuration");
    expect(corps).not.toContain("latency_ms");
  });

  it("un secret FAUX ne donne pas le détail, et ne refuse pas non plus", async () => {
    // Répondre 401 ferait échouer tous les moniteurs déjà en place, et
    // transformerait la sonde en oracle de validité de secret.
    baseOk();

    const res = await GET(
      requetePublique({ authorization: "Bearer mauvais-secret" }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toBeUndefined();
  });

  it("sans CRON_SECRET configuré, personne n'obtient le détail", async () => {
    delete process.env.CRON_SECRET;
    baseOk();

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(body.checks).toBeUndefined();
  });

  it("le porteur du secret retrouve les latences et l'inventaire des briques", async () => {
    baseOk();

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(body.checks.database.status).toBe("ok");
    expect(typeof body.checks.database.latency_ms).toBe("number");
    expect(body.checks.security_configuration).toBeDefined();
    expect(typeof body.uptime_s).toBe("number");
  });
});

describe("GET /api/health — configuration des secrets", () => {
  it("le détail dit AUSSI quelles familles de jetons sont sur le repli", async () => {
    // Le repli `SPIN_TOKEN_SECRET` est légitime et documenté — ce qui manquait,
    // c'est qu'aucun exploitant ne pouvait dire QUELLES familles en dépendent,
    // donc mesurer ce qu'une rotation de cette clé allait casser. Ce constat ne
    // fait PAS rougir la sonde : provisionner `CLAIM_TOKEN_SECRET` dans
    // l'urgence invaliderait tous les jetons de claim en circulation.
    delete process.env.CLAIM_TOKEN_SECRET;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.token_secret_fallback).toContain("CLAIM_TOKEN_SECRET");
    // Des NOMS de variables, jamais de valeurs.
    expect(JSON.stringify(body.checks.token_secret_fallback)).not.toContain(
      process.env.SPIN_TOKEN_SECRET ?? "spin-token-secret",
    );
  });
});

describe("GET /api/health — un worker exigé mais ABSENT des lignes (M2)", () => {
  /**
   * LE DÉFAUT QUE CES CAS FERMENT.
   *
   * `ops_workers_health()` ne rend une ligne que pour les définitions
   * `where d.enabled`. Un worker fréquent DÉSACTIVÉ au registre — ou retiré
   * de `ops_worker_definitions` — n'apparaît donc dans aucune ligne, et la
   * liste nominative, construite sur ces lignes, ressortait VIDE. Le verdict
   * était juste (503, fail-closed), mais l'exploitant porteur de
   * `CRON_SECRET` n'obtenait aucun nom dans le seul cas où le nom compte :
   * la supervision n'est pas tombée, elle a été éteinte, et rien ne disait
   * laquelle.
   */
  const productionAvecLignes = (
    rows: Array<{ worker: string; healthy: boolean }>,
  ) => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    process.env.TRUSTED_PROXY_PROVIDER = "vercel";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        if (String(input).endsWith("/rest/v1/rpc/ops_workers_health")) {
          return Promise.resolve(Response.json(rows));
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );
  };

  it("503 ET le nom du fréquent désactivé au registre", async () => {
    productionAvecLignes([{ worker: "jobs", healthy: true }]);

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.workers.status).toBe("error");
    expect(body.checks.workers.unhealthy_workers).toContain("sync-contests");
  });

  it("les lignes en défaut d'abord, puis les exigés manquants — ordre stable", async () => {
    // Un ordre déterministe n'est pas une coquetterie : c'est ce qui permet
    // de comparer deux relevés successifs sans lire un diff de permutation.
    productionAvecLignes([{ worker: "weekly-digest", healthy: false }]);

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.workers.unhealthy_workers).toEqual([
      "weekly-digest",
      "jobs",
      "sync-contests",
    ]);
  });

  it("aucun doublon, qu'un nom vienne des lignes ou de l'absence", async () => {
    // `jobs` est rouge ET dupliqué dans les lignes ; `sync-contests` est
    // absent. Chacun doit être nommé UNE fois.
    productionAvecLignes([
      { worker: "jobs", healthy: false },
      { worker: "jobs", healthy: false },
    ]);

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.workers.unhealthy_workers).toEqual([
      "jobs",
      "sync-contests",
    ]);
  });

  it("un registre entièrement muet nomme les deux exigés", async () => {
    productionAvecLignes([]);

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.workers.unhealthy_workers).toEqual([
      "jobs",
      "sync-contests",
    ]);
  });

  it("le corps PUBLIC ne nomme toujours aucun worker absent", async () => {
    // Le diagnostic ajouté reste du même côté de `CRON_SECRET` que le reste :
    // rendre le défaut visible ne doit pas le rendre public.
    productionAvecLignes([{ worker: "jobs", healthy: true }]);

    const res = await GET(requetePublique());
    const corps = await res.text();

    expect(res.status).toBe(503);
    expect(corps).toContain("unhealthy");
    expect(corps).not.toContain("sync-contests");
    expect(corps).not.toContain("unhealthy_workers");
    expect(corps).not.toContain("checks");
  });
});

describe("GET /api/health — la reconciliation des heartbeats est CONSTATABLE", () => {
  /**
   * LE DÉFAUT QUE CES CAS FERMENT.
   *
   * `/api/cron/jobs` referme les heartbeats orphelins toutes les 5 minutes et
   * persiste le compte dans `ops_worker_runs.counters.workerRunsReaped`.
   * Personne ne relisait cette écriture : ni l'admin, ni `ops_workers_health()`
   * qui ne rend que l'état de santé. Un exploitant ne pouvait donc pas
   * distinguer « la réconciliation tourne et n'a rien à faire » de « la
   * réconciliation ne tourne plus » — deux états qui se ressemblent jusqu'au
   * jour où le second se voit.
   */
  const avecDernierRun = (rows: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        if (String(input).includes("/rest/v1/ops_worker_runs")) {
          return Promise.resolve(Response.json(rows));
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

  it("le porteur du secret lit le dernier compte reconcilie et sa date", async () => {
    avecDernierRun([
      {
        counters: { workerRunsReaped: 3, processed: 12 },
        completed_at: "2026-09-14T08:05:00.000Z",
        status: "succeeded",
      },
    ]);

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.reconciliation).toEqual({
      worker_runs_reaped: 3,
      at: "2026-09-14T08:05:00.000Z",
      run_status: "succeeded",
    });
  });

  it("le corps PUBLIC n'en dit rien, et la lecture n'a meme pas lieu", async () => {
    // Non-régression du jeu de clés EXACT du corps public : ce diagnostic vit
    // du même côté de `CRON_SECRET` que les latences et l'inventaire. Et sans
    // secret prouvé, la troisième requête vers Supabase n'est pas émise.
    const appels = vi.fn().mockImplementation((input: string | URL | Request) => {
      if (String(input).includes("/rest/v1/ops_worker_runs")) {
        return Promise.resolve(
          Response.json([
            {
              counters: { workerRunsReaped: 3 },
              completed_at: "2026-09-14T08:05:00.000Z",
              status: "succeeded",
            },
          ]),
        );
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal("fetch", appels);

    const res = await GET(requetePublique());
    const body = await res.json();
    const corps = JSON.stringify(body);

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "features",
      "status",
      "timestamp",
      "version",
    ]);
    expect(corps).not.toContain("reconciliation");
    expect(corps).not.toContain("worker_runs_reaped");
    expect(
      appels.mock.calls.some((call) =>
        String(call[0]).includes("/rest/v1/ops_worker_runs"),
      ),
    ).toBe(false);
  });

  it("lecture en ERREUR : la sonde repond quand meme, verdict inchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        if (String(input).includes("/rest/v1/ops_worker_runs")) {
          return Promise.reject(new Error("PostgREST injoignable"));
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.reconciliation).toBeUndefined();
    // Le reste du détail répond normalement : l'échec est cloisonné.
    expect(body.checks.database.status).toBe("ok");
  });

  it("HTTP en erreur sur la lecture : meme sens sur, aucune exception", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        if (String(input).includes("/rest/v1/ops_worker_runs")) {
          return Promise.resolve(new Response(null, { status: 500 }));
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.reconciliation).toBeUndefined();
  });

  it("AUCUN run enregistre : pas d'exception, verdict inchange", async () => {
    avecDernierRun([]);

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.reconciliation).toBeUndefined();
    expect(body.checks.security_configuration.status).toBe("ok");
  });

  it("un run sans le compteur ne fabrique pas un zero", async () => {
    // Une exécution close AVANT que le compteur existe — ou une probe, qui
    // n'appelle pas le reaper — ne doit pas se lire comme « zéro réconcilié » :
    // c'est la différence entre « rien à faire » et « on ne sait pas ».
    avecDernierRun([
      {
        counters: { processed: 4 },
        completed_at: "2026-09-14T08:05:00.000Z",
        status: "succeeded",
      },
    ]);

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.reconciliation).toBeUndefined();
  });
});
