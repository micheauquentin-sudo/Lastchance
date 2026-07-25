import { pathToFileURL } from "node:url";

const REQUIRED_CHECKS = ["database", "workers", "security_configuration"];

export function normalizeProductionUrl(rawUrl) {
  if (!rawUrl) throw new Error("URL de production manquante");
  const url = new URL(rawUrl);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new Error("Le contrôle de production exige HTTPS");
  }
  url.pathname = "/api/health";
  url.search = "";
  url.hash = "";
  return url;
}

export async function verifyProductionHealth(
  rawUrl,
  { fetchImpl = fetch, timeoutMs = 15_000 } = {},
) {
  const healthUrl = normalizeProductionUrl(rawUrl);
  const response = await fetchImpl(healthUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Healthcheck illisible (HTTP ${response.status})`);
  }
  if (!response.ok || body?.status !== "ok") {
    throw new Error(`Production non saine (HTTP ${response.status})`);
  }
  for (const check of REQUIRED_CHECKS) {
    if (body?.checks?.[check]?.status !== "ok") {
      throw new Error(`Contrôle requis en échec : ${check}`);
    }
  }
  return {
    version: typeof body.version === "string" ? body.version : "inconnue",
    checks: [...REQUIRED_CHECKS],
  };
}

async function main() {
  const rawUrl = process.argv[2] || process.env.PRODUCTION_URL;
  const result = await verifyProductionHealth(rawUrl);
  process.stdout.write(
    `Production saine (${result.version}) : ${result.checks.join(", ")}\n`,
  );
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Contrôle impossible";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
