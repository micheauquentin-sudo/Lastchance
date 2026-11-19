# Routage automatique Antigravity — Modèles Gemini 4 & Effort

Ce fichier complète `AGENTS.md` pour Antigravity uniquement. Chargé automatiquement à chaque session : rester sous 45 lignes.

## 1. Correspondance automatique par périmètre (modèle + effort)
- **Micro-tâche (< 15 lignes, 1 fichier connu)** : exécuter directement sans sous-agent (latence et surcoût zéro).
- **Via `swarm(action="add", model=...)`** (modèles exacts) ou **`invoke_subagent(Model=...)`** (`flash_lite` / `flash` / `pro` selon le palier) :
  - `gemini-4-hydrogen-low` (`flash_lite`) → **`docs-scribe`** (docs, handoff, roadmap), **`vercel-release`** (inventaire/logs/commandes), **`qa-verify`** (exécution vérifs), **`frontend-ui`** (ajustements UI simples).
  - `gemini-4-hydrogen-medium` (`flash`) → **`frontend-ui`** (composants/pages complexes), **`qa-verify`** (réparation de tests), **`research`** (exploration parallèle).
  - `gemini-4-neon-medium` (`flash`) → **`backend-api`** (server actions, API, Zod, crons).
  - `gemini-4-argon-medium` (`pro`) → **`stripe-billing`** (webhooks, abonnements, checkout).
  - `gemini-4-argon-high` (`pro`) → **`db-supabase`** (schéma, migrations, RLS), **`security-review`** (audit multi-tenant lecture seule).
  - `inherit` → uniquement si l'utilisateur demande explicitement de garder le modèle courant.

## 2. Parallélisme automatique (réactivité)
- **Exploration / audit** : lancer les sous-agents `research` (`gemini-4-hydrogen-medium` / `flash`) en parallèle, un par sous-système.
- **Implémentation** : `db-supabase` (`argon-high`) d'abord si SQL requis → `backend-api` (`neon-medium`) + `frontend-ui` (`hydrogen-low`/`medium`) en parallèle sur dossiers disjoints (jamais deux écritures sur les mêmes fichiers).
- **Validation** : `qa-verify` (`hydrogen-low`) et `security-review` (`argon-high`, si auth/RLS/public/webhook) en parallèle → puis `docs-scribe` (`hydrogen-low`).

## 3. Économie maximale de tokens
- Toujours localiser avant de lire (`rg`/`grep` ou recherche ciblée), puis `read_file` avec `StartLine`/`EndLine` (< 150 lignes) ; jamais de lecture complète sur gros fichiers (`docs/decisions.md`, `docs/bugs.md`, `docs/roadmap.md`).
- Chaque brief de sous-agent contient : chemins exacts, décision déjà tranchée, critère de sortie vérifiable, hors-périmètre.
- Sortie des sous-agents : statut, fichiers touchés, résultat exact des commandes — aucun snapshot de code.
