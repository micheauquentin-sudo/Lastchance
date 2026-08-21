---
name: environnement-wsl
description: >-
  Décrit l'environnement d'exécution réel du projet Lastchance (WSL2 Ubuntu,
  Docker natif, stack Supabase locale, Playwright) et les douze pièges appris
  à la dure qui font échouer silencieusement Docker, pgTAP, Vitest ou les E2E.
  À charger avant toute commande qui touche WSL, Docker, Supabase, pgTAP,
  Playwright, ou quand un run se fige, rend « no tests », ou semble ne jamais
  finir.
---

# Environnement d'exécution — WSL2, Docker, Supabase, Playwright

**Docker et Linux sont disponibles.** Toute affirmation du type « impossible de
vérifier faute de Docker » est périmée : Docker tourne nativement dans WSL2, ce
qui contourne l'exigence de build Windows. Ne jamais écrire qu'une vérification
est impossible — l'exécuter.

| Ressource | État vérifié |
|---|---|
| Distro | WSL2 `Ubuntu` 26.04 LTS, noyau 6.18, systemd actif |
| Docker | Engine 29.6.2 natif Linux + Compose v5.3.1 (pas Docker Desktop) |
| Node | v22.22.1 / npm 10.9.4, dans `~/.local/bin` |
| Supabase local | Postgres 15.8, projet `lastchance` |
| Playwright | chromium + WebKit 26.5 — `mobile-chrome`, `mobile-safari`, `desktop-smoke` jouables |

**Migration en tête** : lire `EXPECTED_MIGRATION` dans `src/lib/release.ts`.
Jamais un numéro recopié dans un document — un test unitaire compare cette
constante au dossier `supabase/migrations` et fait rougir la CI en cas d'écart.

## Deux arbres de travail, ne pas les confondre

- **`~/workspaces/lastchance` (WSL)** — le clone de référence : remote GitHub
  réel, `node_modules` Linux, `.next` construit. C'est là que tournent Docker,
  pgTAP et l'app.
- **`C:\Users\MISHOW\Documents\LastChance\Lastchance`** — point d'entrée de
  session, **peut être en retard sur `origin/main`**. Vérifier avant d'agir.
- `~/lc` a été supprimé le 2026-07-28. Ne pas le recréer.

## Les douze pièges

1. **`bash -l` obligatoire.** Node vit dans `~/.local/bin`, absent du PATH d'un
   shell non-login : `npx` retombe sur le `npx.cmd` **Windows** via l'interop et
   échoue sur « chemins UNC non pris en charge ».
2. **Une seule invocation `wsl` par tâche.** La distro s'éteint entre deux
   appels : les conteneurs Supabase redémarrent, Postgres repart en recovery
   (~20 s). Attendre la santé de `supabase_db_lastchance` en tête de script.
3. **Ne pas passer de commande inline.** Le quoting PowerShell → `wsl.exe` mange
   guillemets, `$` et parenthèses. Écrire un `.sh` puis
   `wsl -d Ubuntu -- bash -l /mnt/c/<chemin>/script.sh`.
4. **`supabase db reset` NE SÈME RIEN.** `supabase/config.toml` porte
   `[db.seed] enabled = false` : appliquer le seed explicitement
   (`psql -f supabase/seed.sql`). Sans cela l'app tourne sur une base **vide**
   et tous les E2E échouent sans cause visible.
5. **Attendre un Postgres qui RÉPOND**, pas seulement « healthy ». Boucler sur
   `psql -tAc "select 1;"`, jamais sur `docker inspect` seul.
6. **Un `supabase test db` interrompu laisse un conteneur `pg_prove` orphelin
   qui GÈLE tous les runs suivants** — sans message. Nettoyer AVANT toute
   campagne, et ne toucher qu'aux conteneurs non `supabase_` :
   ```bash
   for id in $(docker ps --format '{{.ID}} {{.Names}}' | grep -v supabase_ | awk '{print $1}'); do
     docker stop -t 5 "$id"
   done
   ```
   Symptômes voisins à ne pas confondre : service WSL expiré
   (`Wsl/Service/0x8007274c` → `wsl --shutdown` puis relance) et base sans
   `supabase_migrations.schema_migrations` après un reset coupé
   (→ `supabase stop --no-backup` puis `supabase start`).
7. **Semer AVANT pgTAP.** La suite doit passer sur base **vide ET semée** :
   cinq assertions en dépendaient sans le dire.
8. **Le démon Docker de WSL2 peut geler sans message.** Symptôme : `docker ps -a`
   ne rend plus la main. Pour trancher entre « ça bufferise » et « c'est gelé »,
   regarder la **date de modification du fichier de sortie**, jamais son
   contenu. Remède : `wsl --shutdown` puis relance.
9. **WSL se fige sous charge lourde** (build + serveur + Playwright + conteneurs
   simultanés). Même remède, même diagnostic par la date de modification.
   Conséquence adoptée : **local d'abord** — pgTAP (~15 s) et E2E **ciblé** via
   `scripts/run-e2e-local.sh` ; la CI distante en **recours**.
   `~/workspaces/lastchance` n'admet **qu'un seul run E2E à la fois** : deux
   builds concurrents sur le même `.next` donnent `ENOENT _buildManifest` et
   `TurbopackInternalError`.
10. **Un `| tail` en fin de script E2E WSL simule un gel** — le tube reste tenu
    par `next-server`, vivant après la fin du run. Écrire dans un **fichier**,
    juger par `test-results/.last-run.json`, jamais par un pipe.
11. **`/tmp` de la distro est VIDÉ à chaque coupure entre invocations `wsl`**
    (conséquence du piège 2) — loger sous `/mnt/c/...` ou dans le dépôt.
12. **Jamais deux runs Vitest concurrents sur le même arbre Windows** — cache
    `.vite` corrompu : 261 fichiers « no tests » alors que la suite est verte
    isolément. Le symptôme est réapparu **sans** run concurrent : au moindre
    « no tests », purger `node_modules/.vite` et rejouer **avant de conclure
    quoi que ce soit** sur l'état de la suite.

## Commandes de référence

```bash
# Ordre de la CI en local : reset → seed → suite pgTAP
wsl -d Ubuntu -- bash -lc "cd ~/workspaces/lastchance && npx --no-install supabase db reset --no-seed && docker exec -i supabase_db_lastchance psql -U postgres -d postgres -q -f - < supabase/seed.sql && npx --no-install supabase test db"

# pgTAP seul (~15 s)
wsl -d Ubuntu -- bash -lc "cd ~/workspaces/lastchance && npx --no-install supabase test db"
```

Depuis PowerShell, le shim `%APPDATA%\npm\docker.cmd` relaie `docker` vers WSL.

**Réinstaller WebKit** (si nécessaire) : `~/install-webkit.sh`, 238 paquets,
`sudo` interactif. Deux pièges — `sudo` remet un `PATH` minimal alors que
`node`/`npx` vivent dans `~/.local/bin`, et le navigateur doit être installé
**en tant qu'utilisateur**, sinon son cache atterrit dans `/root/.cache` où
Playwright ne le cherche pas.
