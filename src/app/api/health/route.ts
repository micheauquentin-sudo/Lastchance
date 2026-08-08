import { NextResponse } from "next/server";
import pkg from "../../../../package.json";
import { eventRealtimeEnabled } from "@/lib/event-realtime";
import { turnstileRequired } from "@/lib/turnstile";

/**
 * Health check : GET /api/health
 *
 * Vérifie que le process répond et que la base (Supabase/PostgREST) est
 * joignable. Renvoie 200 si tout va bien, 503 sinon — directement
 * exploitable par un moniteur d'uptime (UptimeRobot, BetterStack…).
 * Endpoint public, sans données sensibles.
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

export async function GET() {
  const [database, workers] = await Promise.all([checkDatabase(), checkWorkers()]);
  const turnstileConfigured = Boolean(
    process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
  const securityConfiguration = {
    status:
      (!turnstileRequired() || turnstileConfigured)
      && (process.env.NODE_ENV !== "production" || Boolean(process.env.ADMIN_HOSTS))
        ? "ok"
        : "error",
    error:
      turnstileRequired() && !turnstileConfigured
        ? "Protection anti-bot incomplète"
        : process.env.NODE_ENV === "production" && !process.env.ADMIN_HOSTS
          ? "ADMIN_HOSTS manquant"
        : undefined,
  };
  const healthy =
    database.status === "ok"
    && workers.status === "ok"
    && securityConfiguration.status === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      version: pkg.version,
      timestamp: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
      checks: { database, workers, security_configuration: securityConfiguration },
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
