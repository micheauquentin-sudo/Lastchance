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
  { fetchImpl = fetch, timeoutMs = 15_000, bypassSecret, cronSecret } = {},
) {
  const healthUrl = normalizeProductionUrl(rawUrl);
  const headers = { accept: "application/json" };
  if (typeof bypassSecret === "string" && bypassSecret.length > 0) {
    headers["x-vercel-protection-bypass"] = bypassSecret;
  }
  // Depuis SEC-3, `/api/health` ne rend le DÉTAIL (`checks`, latences,
  // configuration de sécurité) qu'à un appelant porteur de `CRON_SECRET` : le
  // corps public dit le verdict, pas ce qui l'a produit.
  if (typeof cronSecret === "string" && cronSecret.length > 0) {
    headers.authorization = `Bearer ${cronSecret}`;
  }
  const response = await fetchImpl(healthUrl, {
    headers,
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
  // Le détail n'est plus garanti présent. Quand il l'est, on vérifie chaque
  // brique — c'est ce qui NOMME la défaillance. Quand il ne l'est pas (sonde
  // lancée sans `CRON_SECRET`), le verdict reste concluant : la route calcule
  // `status: "ok"` comme la CONJONCTION des trois contrôles, donc un « ok »
  // public implique déjà les trois. On perd le nom de la brique fautive, pas
  // la détection — et on le DIT dans le retour plutôt que de laisser croire
  // que trois contrôles ont été lus.
  const detailPresent = Boolean(body?.checks);
  if (detailPresent) {
    for (const check of REQUIRED_CHECKS) {
      if (body.checks?.[check]?.status !== "ok") {
        throw new Error(`Contrôle requis en échec : ${check}`);
      }
    }
  }
  return {
    version: typeof body.version === "string" ? body.version : "inconnue",
    checks: detailPresent ? [...REQUIRED_CHECKS] : [],
    detailPresent,
  };
}

async function main() {
  const rawUrl = process.argv[2] || process.env.PRODUCTION_URL;
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const result = await verifyProductionHealth(rawUrl, { bypassSecret, cronSecret });
  process.stdout.write(
    result.detailPresent
      ? `Production saine (${result.version}) : ${result.checks.join(", ")}\n`
      : `Production saine (${result.version}) : verdict global`
        + ` (détail non demandé — CRON_SECRET absent)\n`,
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
