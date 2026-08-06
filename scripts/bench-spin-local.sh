#!/usr/bin/env bash
# ============================================================
# Banc du VRAI tour de roue — en local, parce que la production le refuse
# ============================================================
#
# POURQUOI CE SCRIPT EXISTE
#
# `docs/perf-report.md` (§5 bis) mesure la production sur des chemins publics :
# statique 602 req/s, lecture dynamique 334 req/s, écriture 409 req/s. Le `spin`
# lui-même y manque, et il ne peut pas y être : `verifyTurnstile` est
# fail-closed et exige un jeton Cloudflare qu'aucun script ne forge. C'est une
# bonne conception — on ne la contourne pas, on déplace la mesure.
#
# Ce script reproduit l'environnement du job `e2e` de la CI (même montage que
# `scripts/run-e2e-local.sh`, dont il est le frère), avec
# `TURNSTILE_REQUIRED=false`, puis appelle la server action `spinWheel` par le
# protocole Next-Action et mesure le débit réel.
#
# CE QU'IL MESURE, ET CE QU'IL NE MESURE PAS
#
# Il mesure le coût APPLICATIF d'un tour : contexte de jeu, seaux de débit,
# `perform_atomic_spin` (verrou consultatif compris), signature du jeton de
# claim — contre un Postgres RÉEL avec les migrations réelles. Il ne mesure pas
# Vercel : pas de réseau, pas de démarrage à froid, pas d'edge. Le rapport utile
# est donc entre CE chiffre et celui du même banc sur `/api/page-opens` en
# local — le surcoût d'un spin par rapport à une écriture simple. Ce facteur-là,
# lui, se transpose sur les mesures de production.
#
# À LANCER DEPUIS WSL, dans ~/workspaces/lastchance (node_modules Linux,
# Docker natif) — jamais via /mnt/c.
#
#   ./scripts/bench-spin-local.sh                    # paliers 5/15/40
#   ./scripts/bench-spin-local.sh --no-build         # réutilise .next
#   ./scripts/bench-spin-local.sh --paliers 10,30
#
# ⚠️ RAM : build + app + Docker en même temps est le pire cas (piège 9 du
# CLAUDE.md). Les paliers restent modérés par défaut pour cette raison.
# ============================================================
set -euo pipefail

BUILD=1
RESET=1
PALIERS="5,15,40"
DUREE=10
for a in "$@"; do
  case "$a" in
    --no-build) BUILD=0 ;;
    --no-reset) RESET=0 ;;
    --paliers) shift; PALIERS="${1:-$PALIERS}" ;;
    --paliers=*) PALIERS="${a#*=}" ;;
    --duree=*) DUREE="${a#*=}" ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
echo "▶ dépôt : $(pwd) — $(git log --oneline -1)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
SLUG="E2EWIN01"   # roue du seed : campagne active, 2 lots, stock 5000

# 1. Conteneurs orphelins non-supabase (piège 6).
echo "▶ nettoyage conteneurs orphelins…"
for id in $(docker ps --format '{{.ID}} {{.Names}}' | grep -v supabase_ | awk '{print $1}' || true); do
  docker stop -t 5 "$id" >/dev/null 2>&1 || true
done

# 2. Supabase up, et on attend un Postgres qui RÉPOND (piège 5).
echo "▶ Supabase…"
npx --no-install supabase start >/dev/null 2>&1 || npx --no-install supabase start || true
until psql "$DB_URL" -tAc 'select 1' >/dev/null 2>&1; do sleep 1; done

if [ "$RESET" -eq 1 ]; then
  echo "▶ reset du schéma…"
  npx --no-install supabase db reset --no-seed >/dev/null
  until psql "$DB_URL" -tAc 'select 1' >/dev/null 2>&1; do sleep 1; done
fi

# 3. Seed explicite : `db reset` ne sème RIEN (config.toml, [db.seed] enabled=false).
echo "▶ seed…"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql >/dev/null

# Le stock du lot gagnant borne le nombre total de tours mesurables. On le
# relève : un banc qui épuise le stock mesure des refus en croyant mesurer un
# débit — le même piège que le seau `scanIp` côté `beacon`.
psql "$DB_URL" -tAc "update public.prizes set stock = 1000000 \
  where wheel_id = 'e2e30000-0000-4000-8000-000000000001' and stock is not null;" >/dev/null
echo "▶ stock du lot gagnant relevé à 1 000 000 (le banc ne doit pas mesurer une rupture)"

# 4. Environnement de l'app — identique au job e2e de la CI.
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
# `next start` force NODE_ENV=production : sans ceci l'anti-robot devient
# obligatoire et TOUS les spins sont refusés — on mesurerait le captcha.
export TURNSTILE_REQUIRED="false"
export STRIPE_SECRET_KEY="sk_test_$(openssl rand -hex 12)"
export STRIPE_WEBHOOK_SECRET="whsec_$(openssl rand -hex 24)"
export STRIPE_API_BASE="http://127.0.0.1:12111"
export RESEND_API_KEY="re_test_$(openssl rand -hex 12)"
export RESEND_FROM_EMAIL="Lastchance bench <bench@test.local>"
export RESEND_BASE_URL="http://127.0.0.1:12112"

# 5. Build.
if [ "$BUILD" -eq 1 ]; then
  echo "▶ build de production…"
  npm run build
fi

# 6. Identifiant de la server action `spinWheel`, lu dans le manifeste du build.
#    Il ne s'invente pas : c'est un hachage produit à la compilation.
MANIFESTE=".next/server/server-reference-manifest.json"
[ -f "$MANIFESTE" ] || { echo "✗ $MANIFESTE absent — lancez sans --no-build"; exit 1; }
ACTION_ID="$(node -e '
  const m = require("./.next/server/server-reference-manifest.json");
  const tables = [m.node, m.edge].filter(Boolean);
  for (const t of tables) {
    for (const [id, e] of Object.entries(t)) {
      if (e.exportedName === "spinWheel" && String(e.filename).endsWith("actions/play.ts")) {
        console.log(id); process.exit(0);
      }
    }
  }
  process.exit(1);
')" || { echo "✗ spinWheel introuvable dans le manifeste"; exit 1; }
echo "▶ action spinWheel = $ACTION_ID"
export BENCH_SPIN_ACTION_ID="$ACTION_ID"

# 7. App + arrêt garanti.
PIDS=()
cleanup() { echo "▶ arrêt des services…"; for p in "${PIDS[@]:-}"; do kill "$p" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT

echo "▶ stubs d'API externes…"
node e2e/api-stubs.mjs >/dev/null 2>&1 & PIDS+=($!)
npx wait-on -t 15000 tcp:12111 tcp:12112

echo "▶ app…"
npm run start >/tmp/bench-app.log 2>&1 & PIDS+=($!)
npx wait-on -t 90000 tcp:3000

# 8. Contrôle de bon sens AVANT de mesurer : un tour doit RÉUSSIR. Sans cette
#    garde, un banc qui reçoit 100 % de refus (captcha, campagne inactive, stock
#    vide) rendrait un débit flatteur — mesurer un refus est plus rapide que
#    mesurer un tour.
echo "▶ vérification d'un tour réel…"
REP="$(curl -s -o /tmp/bench-spin-probe.txt -w '%{http_code}' \
  -X POST "http://localhost:3000/play/$SLUG" \
  -H "Next-Action: $ACTION_ID" \
  -H 'content-type: text/plain;charset=UTF-8' \
  -H "cookie: lc-anonymous-player=11111111-1111-4111-8111-111111111111" \
  --data "[\"$SLUG\"]")"
echo "   HTTP $REP"
if [ "$REP" != "200" ]; then
  echo "✗ la server action ne répond pas 200 — extrait :"; head -c 400 /tmp/bench-spin-probe.txt; echo
  exit 1
fi
if grep -qi 'prizeIndex\|claimToken' /tmp/bench-spin-probe.txt; then
  echo "   ✔ tour RÉUSSI (le flux porte prizeIndex/claimToken)"
else
  echo "   ✗ réponse 200 mais SANS gain : le banc mesurerait un refus."
  head -c 400 /tmp/bench-spin-probe.txt; echo
  exit 1
fi

SPINS_AVANT="$(psql "$DB_URL" -tAc 'select count(*) from public.spins;')"

# 9. Mesure. `beacon` sert de RÉFÉRENCE dans le même environnement : c'est le
#    rapport entre les deux qui se transpose sur la production, pas le chiffre
#    brut d'une machine de développement.
echo
echo "════════ ÉCRITURE SIMPLE (référence locale) ════════"
node scripts/capacity-bench.mjs --url http://localhost:3000 --scenarios beacon \
  --ecrire --slug "$SLUG" --paliers "$PALIERS" --duree "$DUREE" --warmup 3

echo
echo "════════ SPIN RÉEL ════════"
node scripts/capacity-bench.mjs --url http://localhost:3000 --scenarios spin \
  --ecrire --slug "$SLUG" --paliers "$PALIERS" --duree "$DUREE" --warmup 3 \
  --json /tmp/bench-spin.json

SPINS_APRES="$(psql "$DB_URL" -tAc 'select count(*) from public.spins;')"
echo
echo "▶ tours réellement enregistrés en base : $((SPINS_APRES - SPINS_AVANT))"
echo "  (si ce nombre est très inférieur au total de requêtes, une garde a"
echo "   refusé — le débit affiché ne serait pas celui d'un tour complet)"
