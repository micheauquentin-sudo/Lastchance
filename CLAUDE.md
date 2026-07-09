# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

**Status**: V1 MVP livrée (2026-07-07) — fondations consolidées (2026-07-09)
**Branch**: `claude/saas-security-audit-8z3zvv`

## Quick Links
- [Architecture](./docs/architecture.md)
- [Revue d'architecture 2026-07](./docs/architecture-review-2026-07.md)
- [Roadmap](./docs/roadmap.md)
- [Known Issues](./docs/bugs.md)
- [Architecture Decisions](./docs/decisions.md)
- [Project State](./.claude/state/project-state.md)
- [Checkpoint](./.claude/state/checkpoint.md)
- [Memory](./.claude/state/memory.md)

## Development Guidelines
- All changes go to the current working branch (see above)
- Respect the conventions in [docs/architecture.md](./docs/architecture.md):
  Zod + `firstIssue`, `ActionResult`, `requireOrg()`, clients Supabase
  typés (`Database` dans `types/database.ts` à maintenir avec les migrations)
- Commit changes with clear descriptive messages

## Orchestrator
The project uses a context-aware orchestrator for routing and task management. The orchestrator configuration is found in the main settings.

## Last Updated
- **Date**: 2026-07-09
- **By**: Revue d'architecture (Lead Software Architect)
