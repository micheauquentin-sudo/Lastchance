#!/usr/bin/env bash
# ============================================================
# PREUVE DES CONTRÔLES NÉGATIFS DE LA SONDE DE CONCURRENCE
# ============================================================
#
# Une garde qui n a JAMAIS été montrée capable de rougir ne prouve rien. Le
# workflow CI n offrait que DEUX sabotages pour QUATRE scénarios : trois
# gardes affirmaient donc quelque chose qu elles n avaient pas gagné.
#
# Ce script joue les quatre, en local, contre un vrai Postgres. Pour chacun :
#   1. la définition VIVANTE est sauvegardée (jamais une recopie à la main) ;
#   2. la version mutée est produite PAR LE SERVEUR (pg_get_functiondef +
#      replace) — le sabotage ne peut donc pas décrire du code disparu ;
#   3. deux gardes : le motif doit être PRÉSENT dans l original et ABSENT du
#      texte muté ;
#   4. la sonde doit rougir, ET SUR LE BON SCÉNARIO — un rouge ailleurs
#      signalerait une fixture cassée, pas une garde qui fonctionne ;
#   5. remise en état, vérifiée sur le catalogue.
#
# RÉSULTAT DU 2026-07-30 : 4/4 concluants.
#
# Trois pièges payés en l écrivant, notés pour la fois d après :
#   · psql N INTERPOLE PAS ses variables avec -c, seulement via stdin ou -f ;
#   · vue de l INTÉRIEUR du conteneur, Postgres écoute sur 5432, pas sur le
#     port publié côté hôte ;
#   · psql -f lirait le fichier DANS le conteneur, qui ne voit pas ~ de WSL.
#
# USAGE (WSL, Supabase local levé) : bash scripts/prove-sabotages.sh
# ============================================================
set -u
cd ~/workspaces/lastchance || exit 1
LOGS=~/probe-logs; mkdir -p "$LOGS"
PSQL="docker exec -i supabase_db_lastchance psql -U postgres -d postgres"
export PGURL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
export PSQL_CMD="docker exec -i supabase_db_lastchance psql"
export TOURS=4
export CONCURRENTS=4

for i in $(seq 1 120); do $PSQL -tAc "select 1;" >/dev/null 2>&1 && break; sleep 1; done
$PSQL -tAc "select 1;" >/dev/null 2>&1 || { echo "Postgres muet"; exit 1; }

# La sonde du dépôt Windows (resume() amélioré) doit être celle qu'on joue.

presence() {
  $PSQL -tA -v f="$1" -v m="$2" <<<"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=:'f' and pg_catalog.strpos(p.prosrc, :'m') > 0;"
}

CIBLES=(
  "redeem_sans_garde|redeem_by_code| and p.redeemed_at is null||un seul code"
  "spin_stock_sans_garde|perform_atomic_spin| and stock > 0||un seul lot"
  "referral_sans_verrou|consume_referral_spin_grant| for update of r||un jeton"
  "spin_sans_verrou_consultatif|perform_atomic_spin|pg_catalog.pg_advisory_xact_lock(|(|N onglets"
)

echo "############ RÉFÉRENCE ############"
node scripts/concurrency-probe.mjs > "$LOGS/ref.log" 2>&1
rc=$?; echo "exit=$rc (attendu 0)"; grep -E "^OK ·|^ÉCHEC ·|VIOLATION" "$LOGS/ref.log" | head -4
[ "$rc" = "0" ] || { echo "!! référence non verte — on s'arrête"; exit 1; }

CONCLUANTS=0; N=0
for cible in "${CIBLES[@]}"; do
  IFS='|' read -r nom fonction motif remplacement attendu <<< "$cible"
  N=$((N+1))
  echo
  echo "############ $nom ############"
  echo "   $fonction : [$motif] → [${remplacement:-<rien>}]"

  $PSQL -tA -v f="$fonction" <<<"select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=:'f';" > "$LOGS/orig_$N.sql"
  $PSQL -tA -v f="$fonction" -v m="$motif" -v r="$remplacement" <<<"select replace(pg_get_functiondef(p.oid), :'m', :'r') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=:'f';" > "$LOGS/mut_$N.sql"

  grep -qF -- "$motif" "$LOGS/orig_$N.sql" || { echo "   !! ANCRE PÉRIMÉE"; continue; }
  grep -qF -- "$motif" "$LOGS/mut_$N.sql" && { echo "   !! substitution sans effet"; continue; }

  #  lirait le fichier DANS le conteneur, qui ne voit pas ~ de WSL.
  $PSQL -v ON_ERROR_STOP=1 < "$LOGS/mut_$N.sql" >"$LOGS/inst_$N.log" 2>&1 || {
    echo "   !! installation refusée :"; tail -3 "$LOGS/inst_$N.log"; continue; }
  echo "   garde présente après sabotage : $(presence "$fonction" "$motif")  (attendu 0)"

  node scripts/concurrency-probe.mjs > "$LOGS/sab_$N.log" 2>&1
  rc=$?
  scen=$(awk '/^── /{t=$0} /VIOLATION|PREUVE INSUFFISANTE/{print t; exit}' "$LOGS/sab_$N.log")
  echo "   exit=$rc (attendu 1)"
  grep -E "VIOLATION" "$LOGS/sab_$N.log" | head -2
  echo "   scénario en rouge : ${scen:-aucun}"
  if [ "$rc" = "1" ] && echo "$scen" | grep -qF -- "$attendu"; then
    echo "   >>> CONCLUANT"; CONCLUANTS=$((CONCLUANTS+1))
  else
    echo "   >>> NON CONCLUANT"
  fi

  $PSQL -v ON_ERROR_STOP=1 < "$LOGS/orig_$N.sql" >/dev/null 2>&1
  echo "   garde retrouvée après remise en état : $(presence "$fonction" "$motif")  (attendu 1)"
done

echo
echo "############ CONTRÔLE FINAL ############"
node scripts/concurrency-probe.mjs > "$LOGS/final.log" 2>&1
echo "exit=$? (attendu 0)"; grep -E "^OK ·|^ÉCHEC ·" "$LOGS/final.log"
echo
echo "BILAN : $CONCLUANTS/4 sabotages concluants"
