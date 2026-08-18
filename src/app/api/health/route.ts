import { NextResponse } from "next/server";
import pkg from "../../../../package.json";
import { optionalEnv } from "@/lib/env";
import { eventRealtimeEnabled } from "@/lib/event-realtime";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { IP_CLIENT_INCONNUE, clientIpFromHeaders } from "@/lib/request-ip";
import { authorizeCronRequest } from "@/lib/timing-safe";
import { turnstileRequired } from "@/lib/turnstile";

/**
 * Health check : GET /api/health
 *
 * Vérifie que le process répond et que la base (Supabase/PostgREST) est
 * joignable. Renvoie 200 si tout va bien, 503 sinon — directement
 * exploitable par un moniteur d'uptime (UptimeRobot, BetterStack…).
 *
 * ── DEUX RÉPONSES, PAS UNE (SEC-3) ──────────────────────────
 *
 * Le VERDICT est public — c'est la raison d'être de la route, et un moniteur
 * n'a besoin que du code HTTP. Le DÉTAIL ne l'est plus.
 *
 * Ce que ce corps annonçait à qui le demandait : quelles briques existent et
 * laquelle est tombée (`checks.database`, `checks.workers`), les latences
 * exactes de la base et de la RPC — donc une mesure gratuite de la charge — et
 * surtout `security_configuration.error`, qui nommait la protection manquante.
 * « Protection anti-bot incomplète » dit à un attaquant que Turnstile n'est pas
 * en place AVANT qu'il tente quoi que ce soit ; « ADMIN_HOSTS manquant » lui
 * apprend que le back-office n'est pas cloisonné par domaine. C'est un oracle
 * de posture : il transforme une campagne à l'aveugle en campagne renseignée,
 * et il se lisait sans aucune authentification.
 *
 * Le détail passe donc derrière `CRON_SECRET` (même en-tête et même comparaison
 * à temps constant que les routes cron, `authorizeCronRequest`). Un secret
 * absent ou faux ne produit PAS un 401 : la sonde répond normalement, sans le
 * détail. Le contraire ferait échouer tous les moniteurs déjà en place.
 */

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 5000;

interface CheckResult {
  status: "ok" | "error";
  latency_ms: number;
  error?: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serverKey) {
    return {
      status: "error",
      latency_ms: 0,
      error: "Supabase non configuré",
    };
  }

  try {
    // UNE LECTURE BORNÉE, ET NON LA RACINE `/rest/v1/`.
    //
    // La racine fait GÉNÉRER à PostgREST la spec OpenAPI du schéma ENTIER à
    // chaque appel — des dizaines de tables décrites, pour prouver qu'une
    // connexion répond. Le coût s'est vu à la mesure (2026-08-06) : cette
    // sonde ressortait systématiquement DEUX FOIS plus lente que l'RPC
    // `ops_workers_health` juste en dessous, qui fait pourtant un vrai
    // travail. Un indicateur de santé plus cher que ce qu'il surveille finit
    // par mentir sur ce qu'il mesure — et ce chiffre-là sert désormais à
    // arbitrer la capacité (`docs/perf-report.md`, §5 bis).
    //
    // `organizations` est le socle multi-tenant, présent depuis
    // `00001_initial_schema.sql` : la table ne peut pas manquer. `limit=1`
    // borne la réponse, et la clé de service traverse RLS — une base vide
    // rend `[]` avec un 200, ce qui reste la bonne réponse à « joignable ? ».
    const res = await fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
      // La clé reste strictement côté serveur et n'est jamais incluse dans
      // la réponse publique du healthcheck. Les DEUX en-têtes sont requis :
      // le Kong du Supabase local (CI/E2E) refuse apikey seul (401).
      headers: { apikey: serverKey, Authorization: `Bearer ${serverKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      return { status: "error", latency_ms: latency, error: `HTTP ${res.status}` };
    }
    return { status: "ok", latency_ms: latency };
  } catch (err) {
    return {
      status: "error",
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "échec de connexion",
    };
  }
}

async function checkWorkers(): Promise<CheckResult> {
  const start = Date.now();
  // Les workers fréquents sont une exigence de production. En local et dans
  // les previews de test, Supabase/Vault peut volontairement être absent.
  if (process.env.NODE_ENV !== "production") {
    return { status: "ok", latency_ms: 0 };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serverKey) {
    return { status: "error", latency_ms: 0, error: "Workers non configurés" };
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/ops_workers_health`, {
      method: "POST",
      headers: {
        apikey: serverKey,
        Authorization: `Bearer ${serverKey}`,
        "content-type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      return {
        status: "error",
        latency_ms: latency,
        error: "État des workers indisponible",
      };
    }
    const rows = (await res.json()) as Array<{ worker?: string; healthy?: boolean }>;
    const required = new Set(["jobs", "sync-contests"]);
    const healthy = rows.filter(
      (row) => row.healthy === true && row.worker && required.has(row.worker),
    );
    if (healthy.length !== required.size) {
      return {
        status: "error",
        latency_ms: latency,
        error: "Workers non opérationnels",
      };
    }
    return { status: "ok", latency_ms: latency };
  } catch {
    return {
      status: "error",
      latency_ms: Date.now() - start,
      error: "État des workers indisponible",
    };
  }
}

export async function GET(request: Request) {
  // ── PLAFOND PAR IP, FAIL-OPEN ────────────────────────────────────
  //
  // Chaque appel coûte DEUX requêtes réseau vers Supabase (lecture bornée +
  // RPC `ops_workers_health`) : non bornée, cette route amplifie n'importe
  // quelle rafale en charge sur la base — et elle est publique par nature.
  //
  // Fail-OPEN et calibré large (cf. `healthIp`) : une sonde de santé qui
  // répond 429 fait déclarer l'application DOWN par tous les moniteurs. Comme
  // ailleurs, le plafond ne s'applique que sur une IP réellement mesurée —
  // sinon la clé ne désigne personne et devient un interrupteur global.
  const ip = clientIpFromHeaders(request.headers);
  if (ip !== IP_CLIENT_INCONNUE) {
    const sousPlafond = await rateLimit(
      rateLimitBucket("health:ip", ip),
      RATE_LIMITS.healthIp,
    );
    if (!sousPlafond) {
      return NextResponse.json(
        { error: "Trop de requêtes, réessayez dans un instant" },
        { status: 429, headers: { "cache-control": "no-store" } },
      );
    }
  }

  // Le détail n'est servi qu'à un appelant qui prouve connaître `CRON_SECRET`.
  // Secret absent (environnement de développement) = aucun détail pour
  // personne : c'est le sens sûr, et il évite qu'un déploiement sans secret
  // rende par défaut ce que ce correctif ferme.
  const cronSecret = optionalEnv("CRON_SECRET");
  const detailAutorise = Boolean(
    cronSecret && authorizeCronRequest(request, cronSecret),
  );

  const [database, workers] = await Promise.all([checkDatabase(), checkWorkers()]);
  const turnstileConfigured = Boolean(
    process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
  /**
   * L'IP CLIENT EST-ELLE SEULEMENT MESURABLE ? (revue sécu I1)
   *
   * `clientIpFromHeaders` ne lit une IP que derrière un proxy DÉCLARÉ
   * (`TRUSTED_PROXY_PROVIDER`, ou `VERCEL` posé par la plateforme) : partout
   * ailleurs, les en-têtes sont forgeables et elle rend `unknown`. Or TOUS les
   * plafonds par IP du dépôt — /api/page-opens, le mode TV, cette route
   * elle-même — sont gardés par `ip !== IP_CLIENT_INCONNUE`, parce qu'un seau
   * assis sur `unknown` ne désigne personne et deviendrait un interrupteur
   * global (ADR-032).
   *
   * Conséquence : un changement d'hébergement désarme ces plafonds EN SILENCE.
   * Rien ne casse, rien ne loggue, et l'anti-abus disparaît sans qu'aucune
   * alarme ne sonne. C'est exactement la classe de panne qu'une sonde de
   * configuration doit rendre bruyante — au même titre qu'`ADMIN_HOSTS`.
   */
  const clientIpMesurable = Boolean(
    process.env.TRUSTED_PROXY_PROVIDER || process.env.VERCEL,
  );
  const enProduction = process.env.NODE_ENV === "production";

  const securityConfiguration = {
    status:
      (!turnstileRequired() || turnstileConfigured)
      && (!enProduction || Boolean(process.env.ADMIN_HOSTS))
      && (!enProduction || clientIpMesurable)
        ? "ok"
        : "error",
    error:
      turnstileRequired() && !turnstileConfigured
        ? "Protection anti-bot incomplète"
        : enProduction && !process.env.ADMIN_HOSTS
          ? "ADMIN_HOSTS manquant"
          : enProduction && !clientIpMesurable
            ? "IP client non mesurable — plafonds par IP désarmés"
        : undefined,
  };
  const healthy =
    database.status === "ok"
    && workers.status === "ok"
    && securityConfiguration.status === "ok";

  return NextResponse.json(
    {
      // ── CORPS PUBLIC : le verdict, et rien de plus ───────────────
      status: healthy ? "ok" : "unhealthy",
      version: pkg.version,
      timestamp: new Date().toISOString(),
      // ── DÉTAIL : seulement sur preuve de `CRON_SECRET` ───────────
      // Latences (mesure gratuite de la charge), inventaire des briques, et
      // `security_configuration.error` qui NOMME la protection manquante.
      ...(detailAutorise
        ? {
            uptime_s: Math.round(process.uptime()),
            checks: {
              database,
              workers,
              security_configuration: securityConfiguration,
            },
          }
        : {}),
      /**
       * DRAPEAUX D'EXPLOITATION — pas un contrôle de santé, un CONSTAT.
       *
       * `EVENTS_REALTIME_ENABLED` change le comportement d'une soirée entière
       * (cadence de rafraîchissement divisée par douze, cf. `docs/perf-report.md`
       * §7) et n'est observable nulle part ailleurs : la prop n'est rendue que
       * sur une session existante, et la variable est stockée « Sensitive » chez
       * l'hébergeur, donc illisible même par son propriétaire.
       *
       * Poser une variable et ne pas pouvoir vérifier qu'elle a pris, c'est
       * exploiter à l'aveugle — ce dépôt a déjà payé ça deux fois aujourd'hui
       * (une CI qu'on croyait verte, un build qu'on croyait passé). Le booléen
       * ci-dessous n'expose aucun secret : il dit si une fonctionnalité est
       * active, ce que n'importe quel joueur constate en ouvrant la page.
       */
      features: { events_realtime: eventRealtimeEnabled() },
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
