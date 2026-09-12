#!/usr/bin/env bash
# Banc local de la soiree live avec 100, 250 puis 500 joueurs reels en base.
# Chaque palier ouvre autant de workers HTTP que de joueurs : c'est plus dur
# que le repli navigateur normal (un poll toutes les 2,5 s), et mesure la vraie
# server action getEventState sur un build de production.
set -euo pipefail

BUILD=1
RESET=1
DUREE=8
for argument in "$@"; do
  case "$argument" in
    --no-build) BUILD=0 ;;
    --no-reset) RESET=0 ;;
    --duree=*) DUREE="${argument#*=}" ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
DB_CONTAINER="supabase_db_lastchance"
SESSION_ID="e2ed0000-0000-4000-8000-000000000021"
QUESTION_ID="e2ed0000-0000-4000-8000-000000000011"
ORG_ID="e2e10000-0000-4000-8000-000000000001"
CODE="E2EVNT"
PORT=3100

pg() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres "$@"
}
pg_file() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$1"
}
attendre_pg() {
  local fin=$((SECONDS + 120))
  until pg -tAc 'select 1' >/dev/null 2>&1; do
    if [[ "$SECONDS" -ge "$fin" ]]; then
      echo "Postgres ne repond pas apres 120 s." >&2
      exit 1
    fi
    sleep 1
  done
}

echo "Depot : $(pwd) — $(git log --oneline -1)"
npx --no-install supabase start >/dev/null 2>&1 || true
attendre_pg
if [[ "$RESET" -eq 1 ]]; then
  npx --no-install supabase db reset --no-seed
  attendre_pg
  pg_file supabase/seed.sql >/dev/null
fi

eval "$(npx --no-install supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_SITE_URL="http://localhost:$PORT"
export NEXT_PUBLIC_APP_URL="http://localhost:$PORT"
export SPIN_TOKEN_SECRET="$(openssl rand -hex 32)"
export CLAIM_TOKEN_SECRET="$(openssl rand -hex 32)"
export PLAYER_KEY_SALT="$(openssl rand -hex 32)"
export UNSUBSCRIBE_TOKEN_SECRET="$(openssl rand -hex 32)"
export TEAM_INVITE_TOKEN_SECRET="$(openssl rand -hex 32)"
export CRON_SECRET="$(openssl rand -hex 16)"
export TURNSTILE_REQUIRED="false"
export STRIPE_SECRET_KEY="sk_test_$(openssl rand -hex 12)"
export STRIPE_WEBHOOK_SECRET="whsec_$(openssl rand -hex 24)"
export RESEND_API_KEY="re_test_$(openssl rand -hex 12)"
export RESEND_FROM_EMAIL="Lastchance bench <bench@test.local>"
export EVENTS_REALTIME_ENABLED="true"

if [[ "$BUILD" -eq 1 ]]; then
  npm run build
fi

manifest=".next/server/server-reference-manifest.json"
[[ -f "$manifest" ]] || { echo "$manifest absent" >&2; exit 1; }
ACTION_ID="$(node -e '
  const m = require("./.next/server/server-reference-manifest.json");
  for (const table of [m.node, m.edge].filter(Boolean)) {
    for (const [id, entry] of Object.entries(table)) {
      if (entry.exportedName === "getEventState" && String(entry.filename).endsWith("actions/events.ts")) {
        console.log(id); process.exit(0);
      }
    }
  }
  process.exit(1);
')"
export BENCH_EVENT_ACTION_ID="$ACTION_ID"
export BENCH_EVENT_SESSION_ID="$SESSION_ID"
export BENCH_EVENT_CODE="$CODE"

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

npm run start -- -p "$PORT" >/tmp/lastchance-bench-event-app.log 2>&1 &
PIDS+=($!)
npx wait-on -t 120000 "tcp:$PORT"

mkdir -p test-results
for population in 100 250 500; do
  maximum=100
  if [[ "$population" -gt 100 ]]; then maximum=500; fi

  pg -v ON_ERROR_STOP=1 \
    -v session_id="$SESSION_ID" \
    -v question_id="$QUESTION_ID" \
    -v org_id="$ORG_ID" \
    -v population="$population" \
    -v maximum="$maximum" <<'SQL' >/dev/null
delete from public.event_answers where session_id = :'session_id'::uuid;
delete from public.event_players where session_id = :'session_id'::uuid;
update public.event_sessions
   set status = 'live',
       phase = 'question_active',
       current_question_id = :'question_id'::uuid,
       current_question_started_at = now(),
       max_participants = :'maximum'::integer
 where id = :'session_id'::uuid;
insert into public.event_players(
  session_id, organization_id, token_hash, pseudo, score
)
select :'session_id'::uuid,
       :'org_id'::uuid,
       encode(extensions.digest('bench-player-' || n::text, 'sha256'), 'hex'),
       'Joueur ' || n::text,
       (n * 17) % 5000
  from generate_series(1, :'population'::integer) n;
SQL

  count="$(pg -tAc "select count(*) from public.event_players where session_id = '$SESSION_ID'" | tr -dc '0-9')"
  [[ "$count" = "$population" ]] || { echo "Population inattendue: $count" >&2; exit 1; }

  echo "Sonde fonctionnelle de getEventState"
  HTTP_STATUS="$(curl -sS -o /tmp/lastchance-bench-event-probe.txt -w '%{http_code}' \
    -X POST "http://localhost:$PORT/event/$CODE" \
    -H "Next-Action: $ACTION_ID" \
    -H 'content-type: text/plain;charset=UTF-8' \
    --data "[{\"sessionId\":\"$SESSION_ID\"}]")"
  if [[ "$HTTP_STATUS" != "200" ]] \
    || ! grep -q 'question_active' /tmp/lastchance-bench-event-probe.txt; then
    echo "La sonde getEventState n'a pas rendu la session active (HTTP $HTTP_STATUS)." >&2
    head -c 500 /tmp/lastchance-bench-event-probe.txt >&2 || true
    echo >&2
    exit 1
  fi

  echo "Palier population=$population, concurrence=$population"
  node scripts/capacity-bench.mjs \
    --url "http://localhost:$PORT" \
    --scenarios event \
    --ecrire \
    --paliers "$population" \
    --duree "$DUREE" \
    --warmup 2 \
    --timeout 15000 \
    --json "test-results/capacity-event-$population.json" \
    --markdown "test-results/capacity-event-$population.md"
  node -e '
    const report = require(`./test-results/capacity-event-${process.argv[1]}.json`);
    const result = report.scenarios.event?.[0];
    if (!result || result.tauxErreur !== 0 || result.erreursReseau !== 0) {
      console.error("Palier invalide : erreurs HTTP ou reseau detectees.", result);
      process.exit(1);
    }
  ' "$population"
done
