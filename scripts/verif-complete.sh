#!/usr/bin/env bash
# Le rituel de vérification complet — en une commande, avec ses parades intégrées.
#
# CE QUE CE SCRIPT APPORTE par rapport à la liste de commandes du CLAUDE.md :
# les pièges y sont ENCODÉS, pas racontés. Un document doit être relu et appliqué
# à la main à chaque passage — et le jour où on l'oublie, on ne le sait pas ; un
# script les applique toujours. Les six parades embarquées, avec leur numéro de
# piège dans le CLAUDE.md :
#
#   piège 4   `supabase db reset` ne sème rien → on sème explicitement
#   piège 5   « healthy » ≠ « répond » → on boucle sur `select 1`, borné
#   piège 6   un pg_prove orphelin gèle tout run suivant, sans message → on purge
#   piège 7   pgTAP doit passer sur base VIDE **et** SEMÉE → les deux, dans cet ordre
#   piège 10  un `| tail` simule un gel → on écrit dans un FICHIER, jamais un pipe
#   piège 12  cache .vite corrompu = « no tests » massif → détecté, purgé, rejoué
#
# Plus la garde qui manquait : la DÉRIVE DES TYPES. `src/types/database.generated.ts`
# doit refléter le schéma ; aujourd'hui seule la CI le voit, à 8 minutes d'aller-retour.
# Ici on le voit en local, et le fichier régénéré reste sur place — prêt à commiter.
#
# À LANCER DEPUIS WSL, dans le clone de référence ~/workspaces/lastchance
# (node_modules Linux, Docker natif) — PAS via /mnt/c.
#
#   cd ~/workspaces/lastchance && ./scripts/verif-complete.sh
#
# Options :
#   --rapide       statique + build + Vitest seulement. Aucun Docker, aucun pgTAP.
#                  ~8 min, c'est la boucle d'itération.
#   --db-seul      l'inverse : Docker, pgTAP (vide puis semée) et dérive des types,
#                  sans rejouer typecheck/lint/build/Vitest. Pour un chantier
#                  purement SQL, ou pour reprendre après un rouge côté base.
#   --continuer    ne pas s'arrêter au premier rouge (portrait complet, plus long)
#   --e2e [args…]  ajouter l'E2E après pgTAP. TOUT ce qui suit --e2e est transmis à
#                  scripts/run-e2e-local.sh (donc à playwright). Sans argument =
#                  suite complète, lourde sur 8 Go : préférer --e2e --project=mobile-chrome e2e/xxx.spec.ts
#
# ⚠️ Un seul run à la fois sur un arbre donné (pièges 9 et 12) : le verrou plus bas
# le fait respecter au lieu de l'espérer.
set -uo pipefail

RAPIDE=0
DB_SEUL=0
ARRET=1
E2E=0
E2E_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --rapide)    RAPIDE=1 ;;
    --db-seul)   DB_SEUL=1 ;;
    --continuer) ARRET=0 ;;
    --e2e)       E2E=1; shift; E2E_ARGS=("$@"); break ;;
    # L'en-tête EST l'aide : on la rend jusqu'à la première ligne de code, sans
    # borne chiffrée — un `sed -n '2,40p'` déborde dès qu'on ajoute un paragraphe.
    -h|--help)   awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0 ;;
    *) echo "option inconnue : $1 (voir --help)"; exit 2 ;;
  esac
  shift
done

if [ "$RAPIDE" -eq 1 ] && [ "$DB_SEUL" -eq 1 ]; then
  echo "--rapide et --db-seul s'excluent : le premier saute la base, le second ne fait qu'elle."
  exit 2
fi

cd "$(git rev-parse --show-toplevel)" || exit 1
RACINE="$(pwd)"

# ── Piège 10 : la sortie va dans un FICHIER ──────────────────────────────────
# Un `| tail` en fin de script reste tenu par next-server, vivant après la fin du
# run : le script ne rend jamais la main bien que tout soit fini, et on croit à un
# gel. On juge sur le fichier et sur les codes de retour, jamais sur un tube.
mkdir -p test-results
JOURNAL="$RACINE/test-results/verif-$(date +%Y%m%d-%H%M%S).log"
: >"$JOURNAL"

# ── Pièges 9 et 12 : un seul run à la fois sur cet arbre ─────────────────────
# Deux agents télescopés sur le même .next → ENOENT _buildManifest ; deux Vitest
# sur le même arbre → cache .vite corrompu et 261 fichiers « no tests ». Le verrou
# transforme une consigne en garantie. flock est fourni par util-linux (présent
# sur Ubuntu) ; absent, on continue sans garde plutôt que d'échouer.
VERROU="$RACINE/test-results/.verif.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$VERROU"
  if ! flock -n 9; then
    echo "✗ Une autre vérification tourne déjà sur cet arbre ($VERROU)."
    echo "  Deux runs concurrents corrompent .next et le cache .vite — pièges 9 et 12."
    exit 1
  fi
fi

RESULTATS=()
ECHECS=0
DEPART=$SECONDS

recapituler() {
  echo
  echo "──────────────────────────────────────────────────────────"
  for l in "${RESULTATS[@]}"; do echo "  $l"; done
  echo "──────────────────────────────────────────────────────────"
  printf '  %d étape(s) en échec · %d min %d s · journal : %s\n' \
    "$ECHECS" "$(((SECONDS-DEPART)/60))" "$(((SECONDS-DEPART)%60))" "$JOURNAL"
}

# `printf '%-46s'` aligne sur des OCTETS : tout libellé portant un « é » ou un
# tiret cadratin se retrouve rentré de plusieurs colonnes. `${#nom}` ne suffit
# pas non plus — il ne compte des caractères que si la locale est UTF-8, ce qui
# n'est PAS le cas partout (Git Bash sous Windows sort avec LANG vide). D'où ce
# comptage explicite : en UTF-8 les octets de continuation valent 0x80–0xBF ;
# les retirer laisse exactement un octet par caractère, quelle que soit la locale.
largeur_caracteres() {
  LC_ALL=C printf '%s' "$1" | LC_ALL=C tr -d '\200-\277' | LC_ALL=C wc -c
}

aligner() {
  local nom="$1" large=46 pad
  pad=$((large - $(largeur_caracteres "$nom")))
  [ "$pad" -lt 1 ] && pad=1
  printf '▶ %s%*s' "$nom" "$pad" ""
}

etape() {
  local nom="$1"; shift
  aligner "$nom"
  local t0=$SECONDS
  {
    echo
    echo "════════ $nom ════════"
  } >>"$JOURNAL"
  if "$@" >>"$JOURNAL" 2>&1; then
    printf '✓ %3ds\n' "$((SECONDS-t0))"
    RESULTATS+=("✓ $nom")
    return 0
  fi
  printf '✗ %3ds\n' "$((SECONDS-t0))"
  RESULTATS+=("✗ $nom")
  ECHECS=$((ECHECS+1))
  if [ "$ARRET" -eq 1 ]; then
    echo
    echo "  Arrêt au premier rouge. Détail dans le journal :"
    echo "    tail -40 $JOURNAL"
    echo "  (--continuer pour dérouler quand même toutes les étapes)"
    recapituler
    exit 1
  fi
  return 1
}

sauter() {
  aligner "$1"
  printf '· %s\n' "$2"
  RESULTATS+=("· $1 — $2")
}

# ── Piège 12 : le cache .vite corrompu ──────────────────────────────────────
# Symptôme : la suite rapporte « no tests » sur des dizaines de fichiers alors
# qu'elle est verte isolément. Constaté avec ET sans run concurrent. La consigne
# était « purger node_modules/.vite et rejouer AVANT de conclure quoi que ce soit
# sur l'état de la suite » — ici on ne conclut pas avant d'avoir rejoué.
vitest_avec_parade() {
  # Sortie dans un fichier À PART avant recopie : chercher « no tests » dans le
  # journal entier ferait remonter la trace d'une étape précédente et purgerait
  # le cache pour rien.
  local tampon="$RACINE/test-results/.vitest.out"
  npm test >"$tampon" 2>&1
  local code=$?
  cat "$tampon" >>"$JOURNAL"
  [ "$code" -eq 0 ] && return 0

  if grep -qiE 'no test (files )?found|no tests' "$tampon"; then
    {
      echo
      echo "── « no tests » détecté : purge de node_modules/.vite et rejeu (piège 12) ──"
    } >>"$JOURNAL"
    rm -rf node_modules/.vite
    npm test >"$tampon" 2>&1
    code=$?
    cat "$tampon" >>"$JOURNAL"
    [ "$code" -eq 0 ] && return 0
  fi
  return 1
}

# ── Piège 5 : attendre un Postgres qui RÉPOND, pas seulement « healthy » ────
# Le conteneur passe healthy avant d'accepter les connexions ; lire une base à
# moitié levée, c'est en tirer de fausses conclusions. Attente BORNÉE : une
# boucle infinie ne distingue pas « la base démarre » de « le client n'existe
# pas » (psql n'est pas installé sur toute machine WSL — d'où le repli).
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
if command -v psql >/dev/null 2>&1; then
  pg()      { psql "$DB_URL" "$@"; }
  pg_file() { psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$1"; }
else
  pg()      { docker exec -i supabase_db_lastchance psql -U postgres -d postgres "$@"; }
  pg_file() { docker exec -i supabase_db_lastchance psql -U postgres -d postgres \
                -v ON_ERROR_STOP=1 -f - < "$1"; }
fi

attendre_pg() {
  local fin=$((SECONDS + 120))
  until pg -tAc 'select 1' >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$fin" ]; then
      echo "Postgres ne répond pas après 120 s (conteneur mort, ou client injoignable)"
      return 1
    fi
    sleep 1
  done
}

# ── Piège 6 : les conteneurs orphelins ──────────────────────────────────────
# Un `supabase test db` interrompu laisse un pg_prove qui GÈLE tous les runs
# suivants — sans message, sans erreur : la commande semble ne jamais finir.
# Trois « échecs » d'une même soirée venaient de là. On ne touche qu'aux
# conteneurs non supabase_.
purger_orphelins() {
  local ids
  ids=$(docker ps --format '{{.ID}} {{.Names}}' | grep -v supabase_ | awk '{print $1}')
  for id in $ids; do docker stop -t 5 "$id" >/dev/null 2>&1 || true; done
  return 0
}

# ── La dérive des types ─────────────────────────────────────────────────────
# `npm run types:generate` interroge la PRODUCTION (--linked), où les migrations
# de la branche ne sont pas encore appliquées : il faut --local. Le fichier
# régénéré est laissé en place — s'il diffère, c'est le correctif, prêt à commiter.
derive_des_types() {
  node scripts/generate-db-types.mjs --local || return 1
  if ! git diff --exit-code -- src/types/database.generated.ts; then
    echo "src/types/database.generated.ts a dérivé du schéma."
    echo "Le fichier vient d'être régénéré : il est à commiter tel quel."
    return 1
  fi
}

echo "▶ dépôt  : $RACINE"
echo "▶ journal: $JOURNAL"
echo

# ═══ Contrôles statiques — ils échouent en secondes, sans Docker ════════════
if [ "$DB_SEUL" -eq 0 ]; then
  etape "typecheck"                    npm run typecheck
  etape "lint"                         npm run lint
  etape "casts:check"                  npm run casts:check
  etape "casts — test du garde"        npm run test:casts
  etape "sql:check"                    npm run sql:check
  etape "sql — test du garde"          npm run test:sql
  etape "migrations:check"             npm run migrations:check
  etape "migrations — test du garde"   npm run test:migrations

  # Build AVANT Vitest, délibérément — même raison qu'en CI : le test
  # « ne prérend aucune route porteuse de nonce » inspecte .next/server/app et se
  # neutralise poliment quand aucun build n'existe. Après `npm test`, ce filet
  # serait vert sans jamais rien vérifier, alors qu'il garde une panne totale.
  etape "build de production"          npm run build
  etape "Vitest (parade cache .vite)"  vitest_avec_parade

  if [ -d site/node_modules ]; then
    etape "site — typecheck"           npm --prefix site run typecheck
    etape "site — lint"                npm --prefix site run lint
    etape "site — build"               npm --prefix site run build
  else
    sauter "site vitrine" "site/node_modules absent (npm --prefix site ci)"
  fi
else
  sauter "contrôles statiques" "--db-seul"
fi

if [ "$RAPIDE" -eq 1 ]; then
  echo
  echo "  --rapide : Docker, pgTAP, dérive des types et E2E non joués."
  recapituler
  [ "$ECHECS" -eq 0 ] || exit 1
  exit 0
fi

# ═══ Base de données — à partir d'ici, Docker est requis ═══════════════════
if ! docker info >/dev/null 2>&1; then
  # Piège 8 : le démon Docker de WSL2 peut geler sans message. On le dit au lieu
  # de laisser le script paraître bloqué sur sa première commande.
  echo
  echo "✗ Le démon Docker ne répond pas."
  echo "  S'il ne rend pas la main du tout : wsl --shutdown depuis Windows, puis relance (piège 8)."
  recapituler
  exit 1
fi

# `supabase start` peut lui-même sortir en 1 sur une distro qui vient de se
# réveiller (« container is not ready: starting ») : le démon Docker répond
# déjà à `docker info`, mais les conteneurs qu'il vient de recréer n'ont pas
# fini leur healthcheck. Ce n'est pas le piège 5 (Postgres « healthy » mais
# injoignable) : là, la commande elle-même échoue avant qu'on ait de base à
# interroger. On la reprend plusieurs fois avec une pause, plutôt que de
# laisser un simple réveil de WSL faire échouer tout le script.
demarrer_supabase() {
  local tentative
  for tentative in 1 2 3 4 5; do
    if npx --no-install supabase start; then
      return 0
    fi
    echo "supabase start a échoué (tentative $tentative/5) — pause avant reprise"
    sleep 10
  done
  return 1
}

etape "conteneurs orphelins (purge)" purger_orphelins
etape "supabase start"               demarrer_supabase
etape "Postgres répond"              attendre_pg
etape "db reset (sans seed)"         npx --no-install supabase db reset --no-seed
etape "Postgres répond (après reset)" attendre_pg

# Piège 7 : la suite doit tenir sur base VIDE **et** SEMÉE. Cinq assertions en
# dépendaient sans le dire — vertes en CI par accident d'ordonnancement des jobs,
# rouges chez tout développeur ayant semé sa base.
etape "pgTAP — base VIDE"            npx --no-install supabase test db
etape "dérive des types (--local)"   derive_des_types
etape "seed déterministe"            pg_file supabase/seed.sql
etape "pgTAP — base SEMÉE"           npx --no-install supabase test db

# ═══ E2E — délégué au script existant, base déjà semée et .next déjà bâti ══
if [ "$E2E" -eq 1 ]; then
  # `"${E2E_ARGS[@]}"` et NON `"${E2E_ARGS[@]:-}"` : sur un tableau vide, la
  # seconde forme produit un argument vide qui arrive jusqu'à playwright comme
  # un filtre ne correspondant à rien — la suite complète ne tournerait pas.
  etape "E2E (${E2E_ARGS[*]:-suite complète})" \
    ./scripts/run-e2e-local.sh --no-reset --no-build "${E2E_ARGS[@]}"
else
  sauter "E2E" "non demandé (--e2e pour l'ajouter)"
fi

recapituler
[ "$ECHECS" -eq 0 ] || exit 1
echo "  Tout est vert."
