# Memory — Lastchance

## Contexte essentiel
- **Produit** : SaaS multi-tenant — roue de la fortune par QR code pour
  commerces. V1 MVP livrée le 2026-07-07.
- **Où commencer** : README.md (setup) → docs/architecture.md (système)
  → docs/decisions.md (ADR-001 à 040) → .claude/state/project-state.md
- **Branche de travail** : main (bêta privée, production Vercel)
- ⚠️ **2026-07-25** : le chantier Créateur de quiz (V1.16, ADR-040,
  migration `20260803120000`) est construit et validé mais **NON POUSSÉ /
  NON DÉPLOYÉ** — 6 commits locaux `cb92b19`→`fe1e57b`. Tout le reste du
  projet est en production ; V1.14 (Pronostics génériques,
  `20260801120000`) et V1.15 (Place de marché de campagnes,
  `20260802120000`) ont été poussées sur `origin/main` le 2026-07-25,
  application de leurs migrations non revérifiée.
- ⚠️ **Correction du même jour (fin de journée)** : `origin/main` = `eb3193d`
  (2026-07-25 10:47) contient `cb92b19`→`fe1e57b` — le Créateur de quiz **a
  été poussé** (son application en prod reste non vérifiée). **V1.17 a été
  poussée dans la foulée** : `origin/main` = `f873b77` (commits
  `e310606`→`f873b77`, migration `20260804120000`, application non vérifiée).
- ⚠️ **Écart local/distant réel** : la branche `chantier/audit-3` (audit 3,
  9 migrations `20260805*`) n'est **pas poussée**. Voir
  `docs/audit-3-backlog.md` — l'état de chaque item de l'audit y est constaté
  dans le code, pas déclaré.
- **Où commencer, suite** : docs/decisions.md va d'ADR-001 à **ADR-043**.

## Décisions structurantes (détail dans docs/decisions.md)
- ADR-005 : Next.js 16 + Supabase + Stripe + Vercel, Server Actions partout
- ADR-006 : multi-tenant RLS ; /play public passe par service role + validations
- ADR-007 : spins tracés au lancer, claim token HMAC 15 min,
  spin_id UNIQUE anti double-claim, stock réservé au spin
- ADR-008 : RGPD by design (CHECK consentement, player_key hashé,
  jamais lié aux avis Google)

## Pièges connus / choses apprises
- Fichier "use server" : n'exporter QUE des actions (loadPlayContext
  vit dans lib/play-context.ts avec discriminant `ok`)
- Next 16 : convention `src/proxy.ts` (export default) remplace middleware.ts
- vitest : alias "server-only" → stub (src/test/server-only-stub.ts) +
  env de test dans vitest.config.ts
- Validation SQL locale : Postgres 16 démarré en user `nobody` dans
  /tmp/lastchance-pgdata (socket /tmp, port 54322) + stubs auth.users/uid()
- types DB écrits main (src/types/database.ts) — régénérer via
  `supabase gen types` dès qu'un projet Supabase existe

## Workflow de session
- Une étape = build ✓ + lint ✓ + tests ✓ → commit → push
- Entrées serveur : toujours un schéma Zod ; retours ActionResult<T>
- Mettre à jour project-state.md + checkpoint.md en fin de session
- `AGENTS.md` route Codex vers les 8 playbooks de `.claude/agents/`.
- Toute livraison Vercel passe par `vercel-release` après QA ; production,
  promotion et rollback exigent une demande explicite.

## Sessions
### 2026-07-06→07 : V1 complète
Plan architecture validé → 11 étapes livrées (voir checkpoint.md).
Reste côté utilisateur : clés Supabase/Stripe/Resend + déploiement Vercel.

### 2026-07-21 : V1.6 — Pronostics avancé + Automatisations commerçant
Chantier multi-agents (db-supabase, backend-api, frontend-ui, qa-verify,
security-review) : ligues privées, mode TV, saisie en lot ; budget de
gains au claim, programmation pg_cron, alerte stock, 4 scénarios
marketing dédupliqués par email_log, consentement anniversaire.
ADR-018 à 022. Pièges retenus : toute migration exige le bump
d'EXPECTED_MIGRATION (src/lib/release.ts) dans le même commit ; pgTAP et
E2E impossibles localement sans Docker (à couvrir en CI) ; le rate limit
TV est fail-open par exception documentée (ADR-022) — les écritures
publiques restent fail-closed.

### 2026-07-25 : V1.17 — Encaissement en caisse des lots de pronostics (9e source)
Correction d'une anomalie fonctionnelle EN PRODUCTION : le code `PRONO-…` était
émis et annoncé au joueur, mais la caisse ne connaissait que 8 sources et le seul
chemin de remise exigeait `is_org_editor` — le caissier ne pouvait rien remettre.
ADR-043 : module de caisse unifié à 9 sources (lecture unifiée, écriture par RPC
dédiée), **une seule colonne de vérité** (`delivered_at` → `redeemed_at` +
CHECK d'accord avec `status`), bornes de TTL **volontairement divergentes** de
celles des campagnes (le décompte part de la clôture, pas du passage en caisse).
Pièges retenus : (1) org-scoper une RPC de caisse jusqu'à l'`UPDATE`, jamais
seulement la lecture — sinon le lot est consommé et audité pendant que la caisse
affiche « code inconnu » ; (2) ne pas faire confiance à une colonne
`organization_id` dénormalisée qu'aucun CHECK ne garantit et que `service_role`
peut écrire ; (3) un rate limit posé PAR FAMILLE de codes se multiplie par le
nombre de sources dès qu'une saisie est ambiguë (résidu M2, correctif écrit non
commité) ; (4) pgTAP toujours impossible en local (ni Docker ni CLI Supabase) —
43 + 4 assertions à prouver au job CI `database-security`.
