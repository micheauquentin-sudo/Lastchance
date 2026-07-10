# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

**Status**: V1 MVP + polish (2026-07-10) — prête pour une bêta privée (voir README.md et docs/beta-report.md)
**Branch**: `claude/merchant-mvp-build-w8j7et`

## Quick Links
- [Architecture](./docs/architecture.md)
- [Roadmap](./docs/roadmap.md)
- [Known Issues](./docs/bugs.md)
- [Architecture Decisions](./docs/decisions.md)
- [Beta Report](./docs/beta-report.md)
- [Observability](./docs/observability.md)

## Development Guidelines
- All changes go to branch `claude/merchant-mvp-build-w8j7et`
- Priorité : simplicité, stabilité, qualité du code, expérience commerçant
- Après chaque fonctionnalité : vérifier (tests, typecheck, lint, build), corriger, documenter
- Commit changes with clear descriptive messages

## Orchestrator
The project uses a context-aware orchestrator for routing and task management. The orchestrator configuration is found in the main settings.

## Last Updated
- **Date**: 2026-07-10
- **By**: Product Engineer pass (polish bêta privée)
