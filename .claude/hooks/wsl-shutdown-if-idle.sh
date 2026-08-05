#!/usr/bin/env bash
# Hook PreToolUse (Claude Code) — avant une commande WSL, éteint la distro
# UNIQUEMENT si elle est INACTIVE (aucun build/test en cours) ET tourne depuis
# plus de UPTIME_THRESHOLD_S. But : partir d'un état propre sans jamais tuer un
# travail en cours ni payer un redémarrage (~20 s de recovery Supabase) inutile.
#
# Inerte hors Windows / sans wsl.exe : peut être commité sans risque.
# Câblé via .claude/settings.local.json (gitignoré, personnel).
set -u

# ------------------------------------------------------------------------------
# Réglages projet
UPTIME_THRESHOLD_S=1800     # ancienneté mini avant qu'un shutdown soit jugé utile (30 min)
LOAD_BUSY_THRESHOLD=2.0     # load1 au-dessus = travail en cours (idle+Supabase ≈ 0.3–0.9 ; build/test sur 4 cœurs > 2)
# Process qui signent un vrai travail (jamais la baseline docker/Supabase) :
BUSY_RE='(vitest|playwright|pg_prove|pg_regress|esbuild|next-server|next build|/tsc|chromium|webkit)'
DISTRO="Ubuntu"
# ------------------------------------------------------------------------------

# 1. Est-ce bien une commande qui invoque WSL ? (stdin = JSON du tool)
payload="$(cat)"
printf '%s' "$payload" | grep -qiE 'wsl(\.exe)?[[:space:]]' || exit 0

# 2. wsl.exe disponible ? (no-op sur macOS/Linux)
command -v wsl.exe >/dev/null 2>&1 || exit 0

# 3. La distro tourne-t-elle ? 'wsl -l --running' ne démarre AUCUNE distro.
#    Déjà arrêtée -> rien à éteindre, le prochain appel démarrera propre.
wsl.exe -l --running 2>/dev/null | tr -d '\0' | grep -q "$DISTRO" || exit 0

# 4. Sonde unique via STDIN (bash -s) — contourne le mangling de quoting de
#    l'interop PowerShell/Git-Bash -> wsl.exe (piège n°3 du CLAUDE.md).
info="$(printf '%s\n' \
  'up=$(cut -d. -f1 /proc/uptime)' \
  'load=$(cut -d" " -f1 /proc/loadavg)' \
  "busy=\$(pgrep -fc '$BUSY_RE' 2>/dev/null)" \
  'echo "${up}|${load}|${busy:-0}"' \
  | wsl.exe -d "$DISTRO" -- bash -s 2>/dev/null | tr -d '\r' | head -1)"
up="${info%%|*}"; rest="${info#*|}"; load1="${rest%%|*}"; busy="${rest##*|}"

# Sonde illisible -> ne rien casser.
printf '%s' "$up" | grep -qE '^[0-9]+$' || exit 0

# 5. Trop jeune -> déjà propre.
[ "$up" -ge "$UPTIME_THRESHOLD_S" ] || exit 0

# 6. En cours d'utilisation (process de travail OU charge élevée) -> on n'y touche pas.
printf '%s' "${busy:-0}" | grep -qE '^[0-9]+$' && [ "${busy}" -gt 0 ] && exit 0
high_load="$(awk -v l="${load1:-0}" -v t="$LOAD_BUSY_THRESHOLD" 'BEGIN{print (l+0>t+0)?1:0}')"
[ "$high_load" = "1" ] && exit 0

# 7. Inactive ET assez ancienne -> redémarrage propre.
wsl.exe --shutdown >/dev/null 2>&1
exit 0
