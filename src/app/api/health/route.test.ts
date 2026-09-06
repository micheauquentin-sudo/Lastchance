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
      }),
    );
    expect(JSON.stringify(body)).not.toContain("sync-contests");
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

/* ════════════════════════════════════════════════════════════
 * GET /api/health — LE CHEMIN HÉRITÉ DU WEBHOOK SMS
 *
 * `/api/sms/webhook` accepte encore le secret MAÎTRE en clair dans l'URL, le
 * temps que la configuration Brevo bascule. La branche devait partir « quand
 * le compteur sera à zéro » — sauf que ce compteur n'existait que dans Sentry,
 * que personne n'ouvre. Un chemin de compatibilité qu'on ne peut pas mesurer
 * devient permanent.
 *
 * Ces tests-ci sont la mesure : une requête à /api/health doit permettre de
 * dire « servi il y a N jours » ou « pas servi », sans ouvrir Sentry.
 * ════════════════════════════════════════════════════════════ */
describe("GET /api/health — l'usage de l'URL héritée est lisible", () => {
  /** Réponse PostgREST de `ops_metrics` : n lignes, la plus récente d'abord. */
  const opsMetrics = (dernier: string | null, total: number) =>
    new Response(JSON.stringify(dernier ? [{ created_at: dernier }] : []), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-range": dernier ? `0-0/${total}` : "*/0",
      },
    });

  const productionAvec = (reponseOpsMetrics: Response) => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
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
        if (url.includes("/rest/v1/ops_metrics")) {
          return Promise.resolve(reponseOpsMetrics.clone());
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );
  };

  const ilYA = (jours: number) =>
    new Date(Date.now() - jours * 86_400_000).toISOString();

  it("la branche a servi hier : 503, motif nommé, et la date lisible", async () => {
    productionAvec(opsMetrics(ilYA(1), 42));

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.security_configuration).toEqual({
      status: "error",
      error: "Webhook SMS encore sur l'URL héritée (secret maître en URL)",
    });
    // LA RÉPONSE À LA QUESTION, sans Sentry : quand, et combien de fois.
    expect(body.checks.sms_webhook_legacy_url).toEqual(
      expect.objectContaining({
        lisible: true,
        jours_depuis: 1,
        occurrences: 42,
        recent: true,
      }),
    );
  });

  it("aucun usage sur 30 jours : la sonde est verte et le DIT", async () => {
    productionAvec(opsMetrics(null, 0));

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.sms_webhook_legacy_url).toEqual(
      expect.objectContaining({
        lisible: true,
        dernier_usage: null,
        occurrences: 0,
        recent: false,
      }),
    );
  });

  it("un usage ANCIEN se lit encore, mais ne fait plus rougir", async () => {
    // Une fois la configuration Brevo reprise, l'alerte doit s'éteindre seule.
    // Elle met jusqu'à sept jours ; au-delà, la trace reste lisible pendant
    // toute la rétention d'`ops_metrics` — un rouge qui s'explique, puis un
    // vert qui garde la mémoire de ce qui s'est passé.
    productionAvec(opsMetrics(ilYA(20), 3));

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.sms_webhook_legacy_url).toEqual(
      expect.objectContaining({ jours_depuis: 20, recent: false }),
    );
  });

  it("base injoignable : la sonde n'AFFIRME rien qu'elle n'a pas mesuré", async () => {
    // `lisible: false` ne se confond pas avec « pas d'usage » : une sonde qui
    // les confond annonce une bascule terminée alors qu'elle n'a rien lu.
    productionAvec(new Response(null, { status: 500 }));

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(body.checks.sms_webhook_legacy_url).toEqual(
      expect.objectContaining({ lisible: false, recent: false }),
    );
    // Et elle ne rougit pas de ce fait-là : `checks.database` porte la panne.
    expect(body.checks.security_configuration.status).toBe("ok");
  });

  it("le corps PUBLIC ne dit pas QUELLE porte est encore ouverte", async () => {
    // Annoncer à un inconnu que le webhook SMS accepte encore un secret en URL
    // serait exactement l'oracle de posture que SEC-3 a fermé.
    productionAvec(opsMetrics(ilYA(1), 1));

    const res = await GET(requetePublique());
    const corps = await res.text();

    expect(res.status).toBe(503);
    expect(corps).toContain("unhealthy");
    expect(corps).not.toContain("sms");
    expect(corps).not.toContain("URL héritée");
  });

  it("hors production, un usage hérité ne rend pas la sonde rouge", async () => {
    // En développement la route est jouée par les tests eux-mêmes : rougir ici
    // rendrait la sonde rouge en permanence sur les postes, donc muette.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) =>
        Promise.resolve(
          String(input).includes("/rest/v1/ops_metrics")
            ? opsMetrics(ilYA(0), 5)
            : new Response(null, { status: 200 }),
        ),
      ),
    );

    const res = await GET(requeteDetaillee());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.sms_webhook_legacy_url.recent).toBe(true);
  });

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
