# Rapport de préparation à la mise en production — 2026-07-11

Revue CTO complète : la totalité du code applicatif (actions serveur,
routes API, pages, composants, libs), les 8 migrations SQL et leurs
policies RLS, la configuration (Next, CSP, Sentry, CI), les tests
unitaires et E2E, et la documentation ont été relus.

## Verdict

**GO pour la bêta privée. GO conditionnel pour une production ouverte**
(conditions opérationnelles en §5 — aucune ne demande de code).

Le socle est sain : multi-tenant isolé par RLS + fonctions
`SECURITY DEFINER` verrouillées, autorité entièrement côté serveur sur le
parcours joueur (tirage, stock, limites, jetons signés), rate limiting à
deux étages (Upstash → compteur SQL atomique), webhook Stripe signé et
idempotent, CSP stricte, monitoring Sentry + health check, 107 tests
unitaires au vert, build de production propre.

## 1. Corrigé lors de cette revue

| Gravité | Problème | Correctif |
|---|---|---|
| Haute (outillage) | Deux migrations partageaient le préfixe `00006` — `supabase db push` échoue sur un environnement neuf (le préfixe numérique est la clé de version) | `00006_qr_style.sql` → `00007_qr_style.sql` (ordre d'application réel inchangé) |
| Moyenne | **Fuite de stock** : le stock d'un lot était réservé avant l'insertion du spin ; si celle-ci échouait, l'unité réservée disparaissait sans gagnant | Migration `00008_restore_prize_stock.sql` + compensation dans le chemin d'erreur de `spinWheel` |
| Moyenne | E2E : le test du parcours joueur cherchait « Je m'inscris à la newsletter » au lieu de « S'inscrire à la newsletter » — échec à tort sur toute campagne avec engagement | Libellé corrigé dans `player-flow.spec.ts` |
| Basse (perf) | `claimPrize` : deux requêtes indépendantes (lot, organisation) en séquence | Parallélisées (`Promise.all`) |
| Tests | `stripe.ts` (mapping de statuts, source de vérité de l'accès) et `revalidate-play.ts` (purge ISR) sans tests | `stripe.test.ts` + `revalidate-play.test.ts` — 98 → 107 tests |

S'y ajoute la passe perf de la veille (même branche) : purge ISR de
`/play` à chaque modification commerçant, requêtes dashboard
parallélisées, `loading.tsx`, dédoublonnage des éditeurs.

## 2. Sécurité — état des lieux

Vérifié et jugé solide :

- **Isolation multi-tenant** : RLS sur toutes les tables via
  `is_org_member()` ; écritures publiques (spins, participations,
  newsletter, rate_limits, audit) réservées au service role ; RPC
  sensibles révoquées pour `anon`/`authenticated`.
- **Parcours joueur** : tirage pondéré serveur, poids jamais envoyés au
  client (test E2E dédié), claim token HMAC-SHA256 à durée limitée avec
  comparaison en temps constant, anti-double-claim par contrainte UNIQUE,
  réservation de stock atomique, limites de jeu vérifiées sur `spins`.
- **Abus** : rate limiting spin/claim/login/signup (par IP et par
  empreinte pseudonymisée), Turnstile opt-in fail-closed, fail-open
  documenté sur incident infra (choix assumé).
- **Injections** : zod sur toutes les entrées, terme de recherche
  neutralisé avant `.or()` PostgREST, CSV protégé (RFC 4180 + injection
  de formule), HTML des emails échappé.
- **Headers** : CSP avec liste blanche stricte, HSTS, frame-ancestors,
  Permissions-Policy. `npm audit` : 0 vulnérabilité ; Dependabot + CI en
  place.
- **RGPD** : player_key haché salé (pas de PII brute), consentement
  explicite requis en base (`CHECK accepted_terms`), opt-in marketing
  distinct, `sendDefaultPii: false` côté Sentry.

Compromis assumés (documentés, à réévaluer après la bêta) :
`'unsafe-inline'` dans `script-src` (hydratation App Router sans nonces),
empreinte joueur falsifiable (compensée par rate limiting + Turnstile),
`/api/scan` non rate-limité (statistiques uniquement).

## 3. Points relevés, non bloquants (suivis dans bugs.md)

- `wheels.theme` : colonne morte du schéma initial — à supprimer dans
  une migration de ménage.
- Bucket `logos` : accepte `image/svg+xml` alors que l'app n'uploade que
  PNG/JPEG/WebP (écritures service-role uniquement : sans effet).
- Webhook Stripe : pas de protection contre un event `subscription.*`
  livré dans le désordre (dernier écrit gagne). Risque faible au volume
  de la bêta ; à durcir si besoin en comparant les timestamps d'event.
- `CLAUDE.md` référence encore la branche `claude/merchant-mvp-build-w8j7et`
  (fusionnée) comme branche de travail.

## 4. Décision produit à confirmer

`past_due` coupe **immédiatement** les roues publiques
(`hasActiveAccess`). Stripe relance pourtant le paiement pendant
plusieurs jours (dunning) : la plupart des SaaS maintiennent le service
durant cette fenêtre. Une carte expirée éteint aujourd'hui le jeu du
commerçant sans délai de grâce. Le code est correct — la règle est à
valider (ou à assouplir : traiter `past_due` comme actif pendant X jours).

## 5. Conditions opérationnelles avant production

1. **Environnement** : `SPIN_TOKEN_SECRET` et `PLAYER_KEY_SALT` forts et
   uniques, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `NEXT_PUBLIC_APP_URL` (sinon les URLs retombent sur localhost),
   `RESEND_*` (sinon pas d'email de gain — dégradation silencieuse).
2. **Stripe** : activer les events `customer.subscription.*` et
   `checkout.session.completed` vers `/api/stripe/webhook` ; tester un
   paiement et une annulation de bout en bout en mode test.
3. **Supabase** : appliquer les 8 migrations sur un projet neuf
   (vérifie au passage le renommage 00007) ; configurer les Redirect
   URLs (`/auth/callback`, `/auth/confirm`) ; planifier
   `prune_rate_limits()` (cron quotidien) sinon la table grossit sans
   limite.
4. **Anti-bot / échelle** : renseigner Upstash et Turnstile (l'app
   fonctionne sans, mais c'est la posture prévue pour l'ouverture).
5. **Monitoring** : DSN Sentry serveur + client, moniteur d'uptime sur
   `/api/health`, alerte sur le taux d'erreur du webhook Stripe.
6. **E2E en staging** : `E2E_BASE_URL` + `E2E_PLAY_SLUG` sur un
   environnement réel — la suite Playwright ne tourne pas en CI
   aujourd'hui (elle se skip proprement sans ces variables).
7. **Dimensionnement** : ~850 req/s par instance sur `/play` (mesuré,
   ISR) ; cadrer `--max-old-space-size` et mettre un CDN devant `/play`
   si le trafic dépasse la bêta (voir perf-report.md).

## 6. Vérifications de cette revue

- 107 tests unitaires (15 fichiers) au vert.
- `tsc --noEmit`, ESLint : 0 erreur.
- `next build` : succès, `/play/[slug]` reste SSG/ISR.
- E2E : non exécutables ici (environnement réel requis) — corrigés et à
  rejouer en staging (§5.6).
