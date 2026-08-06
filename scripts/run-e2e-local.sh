#!/usr/bin/env bash
# Lance la suite E2E Playwright en LOCAL (WSL), en reproduisant l'environnement
# du job `e2e` de la CI : Supabase local seedé + app buildée + stubs Stripe/Resend
# (e2e/api-stubs.mjs) + proxy TLS auto-signé pour les cookies Secure de WebKit.
#
# But : déboguer un test E2E sans payer l'aller-retour CI.
#
# À LANCER DEPUIS WSL, dans le clone de référence ~/workspaces/lastchance
# (node_modules Linux, Docker natif) — PAS via /mnt/c, qui peut être en retard
# sur origin/main et n'a pas les node_modules Linux (voir CLAUDE.md).
#
#   cd ~/workspaces/lastchance && ./scripts/run-e2e-local.sh
#
# Cibler un seul projet/spec (recommandé sur 8 Go de RAM — bien plus léger) :
#   ./scripts/run-e2e-local.sh --project=mobile-chrome e2e/spin.spec.ts
#
# Options :
#   --no-reset   ne pas réinitialiser le schéma (garde les données locales ;
#                plus rapide mais l'état n'est plus déterministe entre deux runs)
#   --no-build   réutiliser le .next existant (itération rapide sur un test)
#   tout le reste est transmis tel quel à `npx playwright test`
#
# ⚠️ 8 Go de RAM : build + app + navigateurs + Docker en même temps = le pire cas
# mémoire (piège 9 du CLAUDE.md). Pour un run COMPLET, ferme VS Code et les
# navigateurs Windows d'abord ; sinon cible un seul projet.
set -euo pipefail

RESET=1
BUILD=1
PT_ARGS=()
for a in "$@"; do
  case "$a" in
    --no-reset) RESET=0 ;;
    --no-build) BUILD=0 ;;
    *) PT_ARGS+=("$a") ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
echo "▶ repo : $(pwd)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# 1. Conteneurs orphelins non-supabase : un pg_prove interrompu gèle les runs
#    suivants sans message (piège 6). On ne touche qu'aux non-supabase_.
echo "▶ nettoyage conteneurs orphelins…"
for id in $(docker ps --format '{{.ID}} {{.Names}}' | grep -v supabase_ | awk '{print $1}' || true); do
  docker stop -t 5 "$id" >/dev/null 2>&1 || true
done

# 2. Supabase up + migrations appliquées. On attend un Postgres qui RÉPOND,
#    pas seulement « healthy » (piège 5).
# La CLI n'existe qu'en dépendance du dépôt (npx --no-install), jamais en
# binaire global : un appel « supabase » nu échoue sur tout poste WSL neuf.
echo "▶ Supabase…"
npx --no-install supabase start >/dev/null 2>&1 || npx --no-install supabase start || true
until psql "$DB_URL" -tAc 'select 1' >/dev/null 2>&1; do sleep 1; done

# 3. Reset déterministe (l'E2E consomme des spins/participations : sans reset,
#    le 2e run échoue sur des données déjà mutées). --no-seed : on sème nous-mêmes.
if [ "$RESET" -eq 1 ]; then
  echo "▶ reset schéma…"
  npx --no-install supabase db reset --no-seed >/dev/null
  until psql "$DB_URL" -tAc 'select 1' >/dev/null 2>&1; do sleep 1; done
fi

echo "▶ seed déterministe…"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql >/dev/null

# 4. Environnement de l'app : clés du Supabase local + secrets factices,
#    à l'identique du job CI e2e (STRIPE_API_BASE/RESEND_BASE_URL → stubs locaux).
eval "$(npx --no-install supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_SITE_URL="http://localhost:3000"
export NEXT_PUBLIC_APP_URL="http://localhost:3000"
export SPIN_TOKEN_SECRET="$(openssl rand -hex 32)"
export CLAIM_TOKEN_SECRET="$(openssl rand -hex 32)"
export PLAYER_KEY_SALT="$(openssl rand -hex 32)"
export UNSUBSCRIBE_TOKEN_SECRET="$(openssl rand -hex 32)"
export TEAM_INVITE_TOKEN_SECRET="$(openssl rand -hex 32)"
export CRON_SECRET="$(openssl rand -hex 16)"
# next start force NODE_ENV=production : sans ça l'anti-robot devient obligatoire
# et tous les spins sont bloqués.
export TURNSTILE_REQUIRED="false"
export STRIPE_SECRET_KEY="sk_test_$(openssl rand -hex 12)"
export STRIPE_WEBHOOK_SECRET="whsec_$(openssl rand -hex 24)"
export STRIPE_API_BASE="http://127.0.0.1:12111"
export STRIPE_PRICE_ID_ENGAGEMENT="price_e2e_engagement"
export RESEND_API_KEY="re_test_$(openssl rand -hex 12)"
export RESEND_FROM_EMAIL="Lastchance E2E <e2e@test.local>"
export RESEND_BASE_URL="http://127.0.0.1:12112"

# 5. Build (sauf --no-build).
if [ "$BUILD" -eq 1 ]; then
  echo "▶ build de production…"
  npm run build
fi

# 6. Stubs + app + proxy TLS. Arrêt garanti de tous les services à la sortie.
PIDS=()
cleanup() {
  echo "▶ arrêt des services…"
  for p in "${PIDS[@]:-}"; do kill "$p" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

echo "▶ stubs d'API externes (Stripe :12111, Resend :12112)…"
node e2e/api-stubs.mjs & PIDS+=($!)
npx wait-on -t 15000 tcp:12111 tcp:12112

echo "▶ app (npm start)…"
npm run start & PIDS+=($!)
npx wait-on -t 60000 tcp:3000

echo "▶ proxy TLS (WebKit refuse les cookies Secure sur http://localhost)…"
npx local-ssl-proxy --source 3443 --target 3000 & PIDS+=($!)
npx wait-on -t 30000 tcp:3443
export E2E_BASE_URL="https://localhost:3443"

echo "▶ /api/health :"; curl -s http://localhost:3000/api/health || true; echo

# 7. Playwright — arguments transmis tels quels (cible projet/spec si fournis).
echo "▶ playwright ${PT_ARGS[*]:-<suite complète>}"
npx playwright test "${PT_ARGS[@]}"
