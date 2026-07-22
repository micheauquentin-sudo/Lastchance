# Project State — Lastchance

## Statut
**Phase** : bêta privée — V1 + Studio créatif + Pronostics enrichi
(ligues, TV, saisie rapide) + Automatisations commerçant (V1.6) +
Chasse au trésor multi-QR (V1.7)
**Dernière mise à jour** : 2026-07-22
**Branche** : main (production Vercel, plan Hobby)

## Dernier chantier : Chasse au trésor multi-QR (2026-07-22)
Nouveau module addon (`addon_hunts`, miroir Pronostics) : parcours de 2 à
10 QR codes (étapes), scan → « Valider mon passage » (POST anti-prefetch)
→ tampon + indice → complétion, lot DIRECT avec code de retrait `CHASSE-…`
remis en caisse (RPC `redeem_hunt_completion`). Identité joueur par cookie
HTTP-only + hash (aucune PII). `record_hunt_scan` atomique sous verrou de
chasse (tampon, ordre, délai, complétion + stock). Caisse unifiée
roue/chasse par un champ `source`. Pas de géolocalisation (délai minimal
optionnel seul garde-fou anti-partage). V1 mono-organisation. Fichiers
clés : `20260724120000_treasure_hunts.sql`, `src/lib/hunt-context.ts`,
`src/actions/hunts.ts`, `/hunt/[token]`, `src/components/hunts/*`, caisse
`src/actions/participations.ts`. Sécurité : 1 ÉLEVÉ + 1 MOYEN corrigés
(claim email usage unique, rate-limit scan IP partagée). 385 tests, build
OK (commits `f5525df`→`88db5bc`). ADR-023 à 027. **Points ouverts : 4 INFO
FAIBLE (docs/bugs.md), suites produit (multi-commerçants, mini-jeux,
récompenses intermédiaires, défaut délai > 0).**

## Chantier précédent : accessibilité volet 2 (2026-07-21)
Contraste auto des labels de roue (`src/lib/contrast.ts`,
`labelColor: "auto"` sur les styles vierges uniquement), lien
d'évitement (`skip-link.tsx` sur landing, dashboard, /play, /pronos),
scans axe-core dans Playwright (`e2e/axe.ts`, échec serious/critical,
spec dédiée `e2e/a11y.spec.ts`) ; 3 contrastes landing + `aria-label`
caisse corrigés au passage. 338 tests, build OK (commits `ce2eb78`,
`bc9615c`, `028717d`). **Point ouvert : surveiller le premier run CI
des scans axe (E2E non exécutés localement).**

## Chantier antérieur : quick wins maintenabilité/a11y (2026-07-21)
Types Supabase générés (`src/types/database.generated.ts` + garde CI
anti-dérive ; **réflexe : migration → `npm run types:generate` → commit,
sinon CI rouge**), roue respectant `prefers-reduced-motion`, onglets
Player Hub au clavier (WAI-ARIA Tabs). 324 tests, build OK (commits
`a5fc2cb`, `b7db502`). Règles de refactoring opportuniste consignées
dans docs/roadmap.md.

## Chantier V1.6 (2026-07-21)
Ligues privées + mode TV + saisie en lot côté Pronostics ; budget de
gains, programmation, alerte stock et 4 scénarios marketing côté
automatisations (détail : .claude/state/checkpoint.md, ADR-018 à 022).
Vérifié : typecheck, lint, Vitest 316/316, build. À couvrir en CI :
pgTAP et 73 E2E Playwright (Docker absent localement).

## Le projet
SaaS multi-tenant de gamification pour commerces : roue de la fortune
par QR code, espace commerçant complet, abonnement Stripe.
Stack : Next.js 16 + TS + Tailwind 4 + Supabase + Stripe + Resend + PostHog.

## Étapes livrées
1. ✅ Scaffold Next.js 16 (build/lint/vitest)
2. ✅ Schéma SQL multi-tenant + RLS (validé sur PG16 local : isolation + stock atomique)
3. ✅ Auth Supabase + middleware/proxy + onboarding org
4. ✅ Dashboard + CRUD campagnes (roue 1:1 auto-créée avec lots par défaut)
5. ✅ Config roue + CRUD lots (poids, stock, couleurs, perdants)
6. ✅ /play/[slug] : spin serveur anti-triche + animation (15 tests unitaires)
7. ✅ Formulaire participation RGPD + claim token + email Resend
8. ✅ QR codes (PNG 512px, téléchargement, scans)
9. ✅ Participations (recherche code, validation remise, export CSV) + stats
10. ✅ Stripe (checkout 14j essai, portail, webhook idempotent, gating)
11. ✅ PostHog + README déploiement + docs à jour

## Vérifications effectuées ici
- `npm run build` ✓ · `npm run lint` ✓ · `npm test` (15 tests) ✓
- Migrations appliquées sur PostgreSQL 16 local avec stubs Supabase
- Tests SQL : isolation RLS inter-org, décrément stock 2→0 puis refus

## Ce qui reste à faire hors code (par l'utilisateur)
La production tourne (Supabase, Stripe, Resend, Vercel configurés ;
migrations auto-appliquées). Restent : les activations Vault des workers
pg_cron (docs/observability.md) et l'arbitrage produit reengage/inactive
(ADR-021).

## Points d'attention pour la suite
- Types Supabase : snapshot généré `database.generated.ts` commité (garde CI
  anti-dérive) ; `src/types/database.ts` manuel migre progressivement vers
  les types générés (refactoring opportuniste, roadmap)
- Le stock est réservé au spin (ADR-007) : un gagnant qui abandonne le
  formulaire consomme une unité
- Postgres local de validation : /tmp/lastchance-pgdata (jetable)
