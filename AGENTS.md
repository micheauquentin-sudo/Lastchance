# Lastchance — Instructions d'orchestration

Ce fichier s'applique à tout le dépôt. Il rend les profils spécialisés de
`.claude/agents/` utilisables par Codex sans dupliquer leurs consignes.

## Contexte à charger

- Lire `CLAUDE.md` avant tout chantier significatif.
- Consulter les sections pertinentes de `.claude/state/checkpoint.md` et
  `.claude/state/project-state.md` avant de modifier un domaine existant.
- Traiter les fichiers non suivis et les modifications déjà présentes comme des
  changements appartenant à l'utilisateur : ne pas les écraser ni les inclure
  automatiquement dans un commit.

## Routage des agents

Pour tout changement significatif, utiliser le ou les sous-agents spécialisés
quand l'orchestration est disponible. Chaque sous-agent doit lire entièrement
son playbook avant d'agir. Pour un micro-changement local, l'agent principal peut
appliquer lui-même le même playbook.

| Agent | Playbook | Périmètre |
|---|---|---|
| `db-supabase` | `.claude/agents/db-supabase.md` | Schéma, migrations, RLS, fonctions et tests SQL |
| `backend-api` | `.claude/agents/backend-api.md` | Server actions, routes API et logique métier hors Stripe |
| `frontend-ui` | `.claude/agents/frontend-ui.md` | React, App Router, Tailwind, responsive et accessibilité |
| `stripe-billing` | `.claude/agents/stripe-billing.md` | Checkout, abonnements, webhooks et facturation Stripe |
| `qa-verify` | `.claude/agents/qa-verify.md` | Typecheck, lint, tests, build et E2E |
| `security-review` | `.claude/agents/security-review.md` | Revue sécurité en lecture seule |
| `docs-scribe` | `.claude/agents/docs-scribe.md` | Documentation et mémoire projet |
| `vercel-release` | `.claude/agents/vercel-release.md` | Environnements, previews, production, logs et rollback Vercel |

Une tâche transverse est découpée par périmètre. Les agents qui écrivent ne
doivent pas modifier simultanément les mêmes fichiers. `qa-verify` intervient
après l'intégration. `security-review` est obligatoire pour l'authentification,
les RLS, les routes publiques, les webhooks, les tokens et les changements
susceptibles d'exposer des données ou de l'argent.

## Contrat de livraison

- Diff minimal, aucune refonte opportuniste.
- Entrées externes validées, isolation multi-tenant préservée, aucun secret ou
  renseignement personnel dans les logs et les réponses.
- Une migration Supabase est appliquée et vérifiée avant le code de production
  qui en dépend.
- Un déploiement Vercel de production, une promotion, un rollback ou une
  mutation financière Stripe exige une demande explicite de l'utilisateur.
- Ne jamais déployer un arbre de travail sale sans avoir isolé et confirmé
  exactement les changements inclus.
- Toute livraison significative se termine par les vérifications adaptées,
  puis un résumé des fichiers touchés, des commandes exécutées et des risques
  résiduels.
