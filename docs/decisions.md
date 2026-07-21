# Architecture Decisions - Lastchance

## ADR-001: Project Initialization with Memory System
**Date**: 2026-07-06
**Status**: Accepted
**Context**: Starting fresh project needed structure for context preservation

**Decision**: 
Implement a Claude Code-based memory system with:
- State tracking files in `.claude/state/`
- Checkpoint system for milestones
- Continuous memory for cross-session context
- Documentation-first approach

**Rationale**:
- Maintains project context across Claude Code sessions
- Clear audit trail of decisions and changes
- Supports long-term project sustainability
- Enables smooth handoffs and context transfer

**Consequences**:
- State files become single source of truth for project status
- Requires disciplined updates to memory files
- Enables better context preservation than git alone

**References**:
- [Project State](../state/project-state.md)
- [Checkpoint](../state/checkpoint.md)
- [Memory](../state/memory.md)

---

## ADR-002: Branch Strategy
**Date**: 2026-07-06
**Status**: Accepted
**Context**: Need clear branching strategy for single-developer workflow

**Decision**:
- Development branch: `claude/project-template-init-gvkmn5`
- Main branch: `main` (protected)
- All work commits to development branch
- PR to main for releases/milestones

**Rationale**:
- Isolates development work from main
- Maintains clean main branch history
- Enables testing before merge to main
- Clear tracking of feature work

---

## ADR-003: Documentation Structure
**Date**: 2026-07-06
**Status**: Accepted
**Context**: Need organized documentation system

**Decision**:
Organize documentation into:
- `/docs/` - Architecture, roadmap, decisions, bugs
- `/state/` - Project state, checkpoints, memory
- `CLAUDE.md` - Quick context and navigation

**Rationale**:
- Clear separation between long-term docs and session state
- Easy navigation and reference
- Supports both long-term planning and session continuity

---

## ADR-004: No Business Logic at Initialization
**Date**: 2026-07-06
**Status**: Accepted
**Context**: Starting with clean slate, need deliberate approach to feature development

**Decision**:
- Initialization phase focuses on context and memory
- No business logic implementation during setup
- All context files created first
- Features defined in roadmap before implementation

**Rationale**:
- Ensures clear understanding before coding
- Prevents mid-stream context loss
- Establishes baseline for tracking
- Better requirements gathering

---

## Future Decisions Pending
- Aucune décision en attente : stack (ADR-005), base de données et
  multi-tenant RLS (ADR-006), tests (Vitest + suite E2E Playwright exécutée
  en CI), API (Server Actions + routes `src/app/api/`) et exigences de
  performance ([Performance Report](./perf-report.md)) sont actés et
  implémentés.

---

## Decision Log Template

When making future decisions, use:

```
## ADR-NNN: Title
**Date**: YYYY-MM-DD
**Status**: Pending/Accepted/Deprecated
**Context**: 

**Decision**: 

**Rationale**:

**Consequences**:

**References**:
```

---

## ADR-005 : Stack Next.js + Supabase + Stripe + Vercel
**Date** : 2026-07-06
**Status** : Accepted
**Context** : Pivot vers un SaaS multi-tenant de gamification pour commerces. Besoin d'un MVP robuste, déployable rapidement, sur plans gratuits.

**Decision** : Next.js 16 App Router (TS + Tailwind 4), Supabase (Auth + PostgreSQL RLS), Stripe Checkout + webhook, Resend, PostHog, Vercel. Server Actions plutôt que routes API (sauf webhook Stripe et export CSV).

**Rationale** : un seul repo, zéro infra à gérer, RLS = isolation multi-tenant au niveau base, plans gratuits suffisants pour le pilote.

---

## ADR-006 : Multi-tenant par organization_id + RLS
**Date** : 2026-07-06
**Status** : Accepted
**Decision** : toutes les tables métier portent organization_id ; policies RLS via is_org_member() (SECURITY DEFINER). Le parcours public n'utilise jamais l'anon key : Server Actions + service role avec validations explicites.

**Consequences** : isolation vérifiée par tests SQL (intrus bloqué en lecture et écriture) ; un membre pourra appartenir à plusieurs orgs plus tard sans migration.

---

## ADR-007 : Spin tracé au lancer + claim token HMAC
**Date** : 2026-07-06
**Status** : Accepted
**Context** : le gain est révélé avant le formulaire ; il faut empêcher (a) de relancer jusqu'au lot désiré, (b) de forger un gain.

**Decision** : table spins insérée au moment du lancer (la limite de jeu s'y vérifie) ; résultat signé HMAC-SHA256 15 min renvoyé au client ; participations.spin_id UNIQUE contre le double-claim ; stock réservé atomiquement au spin (désormais via perform_atomic_spin, qui verrouille la fenêtre de jeu, tire et décrémente le stock dans la même transaction).

**Trade-off accepté** : un gagnant qui abandonne le formulaire consomme une unité de stock (préférable à distribuer plus que le stock).

---

## ADR-008 : RGPD by design
**Date** : 2026-07-06
**Status** : Accepted
**Decision** : consentement CGU obligatoire (CHECK SQL + case non pré-cochée), opt-in marketing séparé, identité joueur pseudonymisée (SHA-256 salé IP+UA, jamais d'IP brute), gain jamais conditionné à un avis en ligne, données visibles uniquement par l'org propriétaire (RLS).

---

## ADR-009 : Délai de grâce de 14 jours sur les impayés (past_due)
**Date** : 2026-07-11
**Status** : Accepted
**Context** : `past_due` coupait les roues publiques immédiatement, alors que Stripe relance la carte pendant plusieurs jours (dunning) avant de résilier. Une carte expirée éteignait le jeu du commerçant sans préavis.

**Decision** : pendant `past_due`, l'accès est maintenu 14 jours à partir de l'entrée en impayé (`organizations.past_due_since`, posée par le webhook à la transition, effacée à la sortie). `hasActiveAccess` coupe au-delà de cette borne — même si le webhook final de Stripe (canceled/unpaid) n'arrivait jamais. Bannière dédiée dans le dashboard avec la date de coupure et un lien vers le portail de paiement.

**Consequences** : la coupure est exacte au spin (revalidation serveur à chaque lancer) et ≤ 30 s sur la page /play (ISR). Un impayé non daté (transition en cours) ne coupe pas — l'état incomplet est transitoire, le webhook date l'entrée.

---

## ADR-010 : Organisation active explicite par cookie validé sous RLS
**Date** : 2026-07-17
**Status** : Accepted
**Context** : le modèle autorise plusieurs appartenances, mais le dashboard
sélectionnait la première ligne retournée par PostgreSQL avec `limit(1)`, sans
ordre ni choix utilisateur.

**Decision** : conserver l'id du tenant actif dans un cookie HTTP-only. À chaque
requête, charger les appartenances de l'utilisateur sous RLS et n'accepter le
cookie que s'il correspond toujours à l'une d'elles. Sans préférence valide,
choisir l'appartenance la plus ancienne avec un ordre déterministe. Afficher un
sélecteur dans le dashboard lorsque plusieurs organisations sont disponibles.

**Consequences** : aucune confiance d'autorisation n'est placée dans le cookie ;
un membre retiré bascule automatiquement vers une organisation encore valide.
L'acceptation d'une invitation active immédiatement l'établissement rejoint.

---

## ADR-011 : Gardes applicatives pour tout accès public service-role
**Date** : 2026-07-17
**Status** : Accepted
**Context** : le parcours public doit contourner la RLS, mais des clés étrangères
simples ne garantissent pas à elles seules que toutes les lignes reliées portent
le même `organization_id`.

**Decision** : centraliser les invariants dans `public-resource-guards.ts` et
vérifier explicitement les relations QR → campagne → roue → lots et spin →
campagne → roue → lot avant toute décision ou écriture publique. Filtrer les
relectures de claim par tenant et limiter les colonnes d'organisation chargées
par le rendu public.

**Consequences** : une incohérence inter-tenant est refusée avec un message
générique et signalée au monitoring. Toute nouvelle opération publique utilisant
la service-role doit réutiliser ces gardes ou fournir une frontière équivalente
testée.
