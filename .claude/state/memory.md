# Memory — Lastchance

## Contexte essentiel
- **Produit** : SaaS multi-tenant — roue de la fortune par QR code pour
  commerces. V1 MVP livrée le 2026-07-07.
- **Où commencer** : README.md (setup) → docs/architecture.md (système)
  → docs/decisions.md (ADR-001 à 008) → .claude/state/project-state.md
- **Branche de travail** : claude/project-template-init-gvkmn5 (main protégée)

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

## Sessions
### 2026-07-06→07 : V1 complète
Plan architecture validé → 11 étapes livrées (voir checkpoint.md).
Reste côté utilisateur : clés Supabase/Stripe/Resend + déploiement Vercel.
