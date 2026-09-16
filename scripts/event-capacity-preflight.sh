#!/usr/bin/env bash
# Préflight fail-closed du banc événement distant. Il ne crée ni ne supprime
# aucune donnée : le script de nettoyage fourni n'est appelé qu'avec --check.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail() {
  echo "Préflight capacité refusé : $*" >&2
  exit 2
}

need_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "$name absent"
}

for name in BENCH_URL BENCH_EXPECTED_SHA BENCH_RUN_ID BENCH_EVENT_ACTION_ID \
  BENCH_EVENT_SESSION_ID BENCH_EVENT_CODE BENCH_EVENT_EXPECTED_PHASE; do
  need_env "$name"
done

[[ "$BENCH_RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] \
  || fail "BENCH_RUN_ID invalide"
[[ "$BENCH_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] \
  || fail "BENCH_EXPECTED_SHA doit être un SHA complet"

HEAD_SHA="$(git rev-parse HEAD)"
[[ "$HEAD_SHA" = "$BENCH_EXPECTED_SHA" ]] \
  || fail "HEAD=$HEAD_SHA, attendu=$BENCH_EXPECTED_SHA"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] \
  || fail "le worktree doit être propre et isolé au SHA attendu"

URL_KIND="$(node - "$BENCH_URL" <<'NODE'
const raw = process.argv[2];
let url;
try { url = new URL(raw); } catch { process.exit(2); }
const host = url.hostname.toLowerCase();
const local = (host === "localhost" || host === "127.0.0.1") && url.protocol === "http:";
const production = host === "lastchance.app"
  || host === "www.lastchance.app"
  || host === "app.lastchance.app"
  || host === "lastchance-mu.vercel.app"
  || host === "lastchance-micheau.vercel.app";
if (!local && url.protocol !== "https:") process.exit(3);
if (production) process.stdout.write("production");
else process.stdout.write(local ? "local" : "remote");
NODE
)" || fail "BENCH_URL invalide (HTTPS requis hors localhost)"

[[ "$URL_KIND" != "production" ]] \
  || fail "le scénario event ne se joue jamais contre la production"

if [[ "$URL_KIND" = "remote" ]]; then
  need_env BENCH_CLEANUP_SCRIPT
  [[ -x "$BENCH_CLEANUP_SCRIPT" ]] || fail "BENCH_CLEANUP_SCRIPT absent ou non exécutable"
  "$BENCH_CLEANUP_SCRIPT" --check "$BENCH_RUN_ID" \
    || fail "le nettoyage synthétique n'est pas prêt"

  command -v vercel >/dev/null 2>&1 || fail "CLI Vercel absente"
  DEPLOYMENT_JSON="$(vercel inspect "$BENCH_URL" --format=json 2>/dev/null)" \
    || fail "déploiement Vercel introuvable"
  DEPLOYMENT_ID="$(DEPLOYMENT_JSON="$DEPLOYMENT_JSON" node - <<'NODE'
const deployment = JSON.parse(process.env.DEPLOYMENT_JSON ?? "null");
if (!deployment?.id || deployment.readyState !== "READY") process.exit(1);
process.stdout.write(deployment.id);
NODE
)" || fail "déploiement Vercel absent ou non Ready"
  DEPLOYMENT_DETAIL_JSON="$(vercel api "/v13/deployments/$DEPLOYMENT_ID" 2>/dev/null)" \
    || fail "métadonnées Vercel inaccessibles"
  DEPLOYMENT_DETAIL_JSON="$DEPLOYMENT_DETAIL_JSON" node - "$BENCH_EXPECTED_SHA" "$DEPLOYMENT_ID" <<'NODE' \
    || fail "le déploiement ne correspond pas au SHA attendu ou n'est pas Ready"
const expectedSha = process.argv[2];
const expectedId = process.argv[3];
const deployment = JSON.parse(process.env.DEPLOYMENT_DETAIL_JSON ?? "null");
if (deployment?.id !== expectedId
    || deployment?.readyState !== "READY"
    || deployment?.meta?.githubCommitSha !== expectedSha) process.exit(1);
NODE
fi

HEALTH_URL="${BENCH_URL%/}/api/health"
node - "$HEALTH_URL" <<'NODE' || fail "santé applicative ou Realtime non confirmé"
const url = process.argv[2];
const headers = { "user-agent": "lastchance-capacity-preflight" };
if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
const body = await response.json().catch(() => null);
if (!response.ok || body?.status !== "ok" || body?.features?.events_realtime !== true) process.exit(1);
NODE

echo "Préflight capacité OK — run=$BENCH_RUN_ID sha=$BENCH_EXPECTED_SHA cible=$BENCH_URL"
echo "Limite : ce préflight ne mesure pas Realtime, CPU, RAM ni les connexions DB."
