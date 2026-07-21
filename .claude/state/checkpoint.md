# Checkpoint — Lastchance

## Dernier jalon : Quick wins maintenabilité & accessibilité ✅
**Date** : 2026-07-21 (commits `a5fc2cb`, `b7db502`)
- **Types Supabase générés** : snapshot `src/types/database.generated.ts`
  commité (`npm run types:generate`, source `--linked`) + garde CI
  anti-dérive dans le job `database-security` (régénération `--local` +
  `git diff --exit-code -I 'PostgrestVersion'`).
  **Nouveau réflexe dev : migration → `npm run types:generate` → commit,
  sinon CI rouge.** `database.ts` manuel conservé (en-tête ajouté),
  migration progressive vers les types générés (roadmap).
- **A11y roue** : `prefers-reduced-motion` → spin 4400→300 ms, 1 tour,
  easing linéaire, hook matchMedia sans mismatch d'hydratation
  (`play-experience.tsx`, prop `reducedMotion` de `wheel-svg.tsx`).
  Carte à gratter vérifiée non concernée.
- **A11y onglets Player Hub** : WAI-ARIA Tabs complet (roving tabIndex,
  ArrowLeft/Right avec wrap, Home/End, focus suit la sélection) ; helper
  pur `src/components/pronos/tab-nav.ts` + 8 tests.
**Vérifié** : qa-verify vert — 324 tests, build OK.
**Suite** : règles de « refactoring opportuniste » consignées dans
docs/roadmap.md (découpage des gros fichiers au fil de l'eau, avatars
lazy, axe-core en E2E, items reportés en arbitrage produit).

## Jalon précédent : V1.6 — Pronostics avancé + Automatisations commerçant ✅
**Date** : 2026-07-21
**Contenu** (5 commits `69f158f`→`bc3f60b` + fix sécurité en cours de commit) :
- **DB** (`20260723100000` + `20260723110000`) : ligues privées
  (contest_leagues/members, RPC create/join/leave, leaderboard/rank avec
  `p_league_id` re-numéroté 1..n) ; budget/programmation de campagne
  (imputation atomique dans claim_winning_spin, pause auto,
  run_campaign_schedule en pg_cron SQL direct */10 min) ; alerte stock
  (trigger réarmé au restock) ; automation_settings + email_log
  (dedup_key unique) ; newsletter_subscribers.birth_date ; 4 RPC de
  ciblage service-role ; pgTAP automation.test.sql ;
  EXPECTED_MIGRATION=20260723110000.
- **Backend pronos** : addContestMatches (lot 1..30 tout-ou-rien),
  route publique /api/pronos/[slug]/tv (top 30 sans PII, s-maxage=30,
  fail-open), actions ligues (rate limits dédiés fail-closed).
- **Backend automatisations** : jobs automation.budget-paused/low-stock/
  run-scenarios, cron /api/cron/automations 09:30 (idempotent par
  org+jour), src/lib/automations.ts, 6 emails Resend (transactionnel vs
  marketing List-Unsubscribe), claimPrize avec double consentement
  anniversaire (13..120 ans).
- **UI** : saisie rapide + progression + page TV + onglet Ligues ;
  page /dashboard/settings/automations, carte Programmation et budget,
  bannières budget_reached/schedule_end, seuil stock, case 🎂 dans le
  claim-form.
- **Sécurité** : revue non bloquante, 0 critique/élevé ; MOYEN corrigé
  (garde owner/editor sur updateCampaignAutomation et
  resumeCampaignAfterBudget) ; 2 FAIBLE assumés → docs/bugs.md.
**ADR** : 018 (budget au claim), 019 (anniversaire double consentement),
020 (rangs de ligue), 021 (reengage/inactive), 022 (TV fail-open).
**Vérifié** : typecheck 0 erreur, lint 0 warning, Vitest 316/316, build OK.
**Reste pour la CI** : pgTAP (supabase test db) et 73 E2E Playwright
(Docker absent localement ; --list OK). Chevauchement reengage/inactive :
arbitrage produit ouvert (ADR-021).

## Jalon précédent : V1.2 — réglages de jeu par campagne ✅
**Date** : 2026-07-07 (nuit)
**Contenu** :
- Les actions d'engagement se configurent désormais **par campagne**
  (page campagne, carte « Actions avant de jouer ») — plus dans Réglages.
- Nouvelle carte « Après le gain » par campagne : demander email et/ou
  téléphone avant d'afficher le code (ou rien → code direct, participation
  anonyme), compte à rebours optionnel (10-600 s) avant masquage du code.
- `claimPrize` revalide les exigences côté serveur ; participation avec
  email/prénom nullable + colonne phone ; email de gain envoyé seulement
  si email collecté ; export CSV avec téléphone.
**Migration à appliquer en prod** : `00004_campaign_play_settings.sql`
(après la 00003 ; recopie la config org existante sur les campagnes puis
supprime organizations.engagement).
**Vérifié** : build ✓, lint ✓, 26 tests ✓.

## Jalon précédent : V1.1 — retours du premier déploiement ✅
**Date** : 2026-07-07 (soir)
**Contenu** : app déployée en prod par l'utilisateur (Supabase + Stripe +
Vercel opérationnels, « tout fonctionne »). Trois évolutions livrées suite
aux premiers tests réels :
1. **Email de gain fiabilisé** — logs détaillés `[resend]` (variable
   manquante, id d'envoi, erreur exacte) + guide de dépannage README.
   Cause la plus probable côté prod : env vars Resend absentes de Vercel
   ou domaine non vérifié (mode test = envoi uniquement au propriétaire).
2. **Actions d'engagement pré-spin** — newsletter / Instagram / TikTok /
   avis Google, configurables par le commerçant (Réglages), gate côté
   joueur, revalidation serveur, table `newsletter_subscribers` + export
   CSV, traçabilité `spins.engagement_action`.
3. **Essai 7 jours** (au lieu de 14) — `organizations.trial_ends_at`,
   gating : essai expiré = QR codes toujours créables mais campagnes non
   activables et roues publiques désactivées. Bannières dashboard
   (jours restants / essai terminé). Checkout Stripe : reprend les jours
   d'essai restants (pas de réarmement).
**Migration à appliquer en prod** : `00003_engagement_and_trial.sql`.
**Vérifié** : build ✓, lint ✓, 26 tests unitaires ✓.

## Jalon précédent : V1 MVP complète ✅
**Date** : 2026-07-07
**Contenu** : les 11 étapes du plan V1 sont livrées, vérifiées
(build/lint/15 tests unitaires/tests SQL RLS) et poussées sur
`claude/project-template-init-gvkmn5`.

### Critères de succès du /goal
- [x] Architecture propre (plan validé puis implémenté)
- [x] Base de données bien conçue (8 tables, RLS, fonctions atomiques)
- [x] Authentification sécurisée (Supabase SSR + proxy)
- [x] Système multi-tenant (organization_id partout + RLS testée)
- [x] Dashboard administrateur (5 sections)
- [x] Roue entièrement configurable (lots, poids, stocks, couleurs)
- [x] Parcours utilisateur complet (scan → roue → formulaire → gain)
- [x] Génération de QR Code (PNG téléchargeable + compteur)
- [x] Stripe fonctionnel (checkout, webhook, sync, gating)
- [x] Déployable sur Vercel (guide README ; nécessite les clés services)

## Prochain jalon suggéré : Pilote réel
1. Provisionner Supabase/Stripe/Resend (15 min, guide README)
2. Déployer sur Vercel
3. Tester le parcours complet en conditions réelles
4. Premier commerce pilote → alimenter la roadmap V1.1

## Historique
- 2026-07-06 : Initialisation projet (docs + mémoire)
- 2026-07-06→07 : Développement V1 complet (11 étapes, 1 commit/étape)
