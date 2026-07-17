import { NextResponse } from "next/server";
import pkg from "../../../../package.json";
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
    const res = await fetch(`${url}/rest/v1/`, {
      // La clé reste strictement côté serveur et n'est jamais incluse dans
      // la réponse publique du healthcheck.
      headers: { apikey: serverKey },
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

export async function GET() {
  const database = await checkDatabase();
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
  const healthy = database.status === "ok" && securityConfiguration.status === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      version: pkg.version,
      timestamp: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
      checks: { database, security_configuration: securityConfiguration },
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
