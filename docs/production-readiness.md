# Rapport de préparation à la mise en production — revue du 2026-07-18

Dernière mise à jour opérationnelle : 2026-07-25 (garde d'ordre et
d'immuabilité des migrations).

Revue CTO complète : la totalité du code applicatif (actions serveur,
routes API, pages, composants, libs), l'ensemble versionné des migrations SQL
et de leurs policies RLS, la configuration (Next, CSP, Sentry, CI), les suites
unitaires, pgTAP et E2E, et la documentation ont été relus.

## Verdict

**GO pour la bêta privée. GO conditionnel pour une production ouverte**
(conditions opérationnelles en §5 — aucune ne demande de code).

Le socle est sain : multi-tenant isolé par RLS + fonctions
`SECURITY DEFINER` verrouillées, autorité entièrement côté serveur sur le
parcours joueur (tirage, stock, limites, jetons signés), rate limiting à
deux étages (Upstash → compteur SQL atomique), webhook Stripe signé et
idempotent, CSP stricte, monitoring Sentry + health check, suites automatisées
au vert dans la CI de référence et build de production propre.

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
- **Abus** : rate limiting spin/claim/login/signup/scan (par IP et par
  empreinte pseudonymisée), Turnstile obligatoire en production, spin et scan
  fail-closed si les deux backends de rate limiting sont indisponibles.
- **Injections** : zod sur toutes les entrées, terme de recherche
  neutralisé avant `.or()` PostgREST, CSV protégé (RFC 4180 + injection
  de formule), HTML des emails échappé.
- **Headers** : CSP avec liste blanche stricte, HSTS, frame-ancestors,
  Permissions-Policy. `npm audit` : 0 vulnérabilité ; Dependabot + CI en
  place.
- **RGPD** : player_key haché salé (pas de PII brute), consentement
  explicite requis en base (`CHECK accepted_terms`), opt-in marketing
  distinct, `sendDefaultPii: false` côté Sentry.

Compromis résiduel : `/play` conserve `'unsafe-inline'` dans `script-src` pour
préserver l'ISR. Le dashboard et le back-office utilisent une CSP à nonce.
L'empreinte UA reste falsifiable et est compensée par l'IP de plateforme,
le rate limiting atomique et Turnstile.

## 3. Points relevés, non bloquants (suivis dans bugs.md)

- `wheels.theme` : colonne morte du schéma initial — à supprimer dans
  une migration de ménage.
- Bucket `logos` : accepte `image/svg+xml` alors que l'app n'uploade que
  PNG/JPEG/WebP (écritures service-role uniquement : sans effet).

## 4. Décision produit — tranchée (ADR-009)

`past_due` coupait immédiatement les roues publiques alors que Stripe
relance le paiement pendant plusieurs jours (dunning). **Résolu** : un
délai de grâce de 14 jours court à partir de l'entrée en impayé
(`past_due_since`, posée par le webhook, migration 00009). Au-delà — ou
dès le webhook `canceled`/`unpaid` de Stripe — l'accès est coupé, même
si ce webhook final n'arrivait jamais (borne applicative). Le dashboard
affiche une bannière dédiée avec la date de coupure et le lien vers le
portail de paiement.

## 5. Conditions opérationnelles avant production

1. **Environnement** : secrets HMAC séparés (`CLAIM_TOKEN_SECRET`,
   `TEAM_INVITE_TOKEN_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`) et `PLAYER_KEY_SALT` forts et
   uniques, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `NEXT_PUBLIC_APP_URL` (sinon les URLs retombent sur localhost),
   `RESEND_*` (sinon pas d'email de gain — dégradation silencieuse).
2. **Stripe** : activer les events `customer.subscription.*` et
   `checkout.session.completed` vers `/api/stripe/webhook` ; tester un
   paiement et une annulation de bout en bout en mode test.
3. **Supabase** : laisser le job `database-security` recréer une base locale
   vierge et y appliquer toutes les migrations versionnées ; configurer les
   Redirect URLs (`/auth/callback`, `/auth/confirm`) ; planifier
   `prune_rate_limits()` (cron quotidien) sinon la table grossit sans limite.
   Une migration déjà appliquée ne doit jamais être modifiée, supprimée ou
   renommée. Le head protégé est `20260804120000` : toute migration ajoutée
   ensuite doit avoir un identifiant strictement supérieur au dernier head.
4. **Anti-bot / échelle** : renseigner Upstash et Turnstile ; `/api/health`
   renvoie 503 en production si la configuration Turnstile est incomplète.
5. **Monitoring** : DSN Sentry serveur + client, moniteur d'uptime sur
   `/api/health`, alerte sur le taux d'erreur du webhook Stripe.
6. **E2E** : la suite Playwright tourne en CI (job « e2e » : Supabase
   local seedé, stubs Stripe/Resend, proxy TLS, échec si aucun test ne
   s'exécute). Option : la rejouer contre un environnement réel via
   `E2E_BASE_URL=https://…`.
7. **Dimensionnement** : ~850 req/s par instance sur `/play` (mesuré,
   ISR) ; cadrer `--max-old-space-size` et mettre un CDN devant `/play`
   si le trafic dépasse la bêta (voir perf-report.md).

## 5bis. Canal SMS — gestes réservés au propriétaire (2026-08-01)

Le canal SMS (Brevo) est fonctionnellement clos côté code (ADR-056,
ADR-058 à ADR-061 ; détail `docs/bugs.md`). Il reste **inerte en
production** tant que les gestes suivants, tous hors du dépôt, n'ont pas
été faits par le propriétaire :

1. **Ouvrir un compte Brevo et poser `BREVO_API_KEY` /
   `BREVO_WEBHOOK_SECRET`.** Sans eux, aucun SMS ne part et le webhook de
   STOP n'a nulle part où arriver.

   **Déclarer le webhook par l'API, pas par la console**, pour que le
   secret voyage en en-tête et non dans l'URL — Brevo accepte des
   en-têtes personnalisés sur `POST /v3/webhooks` (champ `headers`,
   `channel: "sms"`), ce que la console web n'expose pas :

   ```bash
   curl -X POST https://api.brevo.com/v3/webhooks \
     -H "api-key: $BREVO_API_KEY" -H "content-type: application/json" \
     -d '{"url":"https://<domaine>/api/sms/webhook","type":"transactional",
          "channel":"sms","events":["unsubscribed","delivered"],
          "headers":[{"key":"x-lastchance-sms-token","value":"<BREVO_WEBHOOK_SECRET>"}]}'
   ```

   **À défaut** (webhook créé depuis la console), l'URL peut porter un
   **jeton dérivé** du secret — jamais le secret lui-même, qui finirait
   dans les journaux d'accès de l'hébergeur, dans un `Referer` et dans
   l'historique de la console du prestataire :

   ```bash
   node -e "console.log(require('crypto').createHmac('sha256', process.env.BREVO_WEBHOOK_SECRET).update('brevo-url-token').digest('hex').slice(0,32))"
   # → coller https://<domaine>/api/sms/webhook?token=<jeton>
   ```

   Le secret maître reste accepté en paramètre d'URL **le temps de la
   bascule**, mais chaque appel émet l'événement de sécurité
   `sms_webhook_legacy_url_secret` (Sentry). Quand ce signal ne remonte
   plus, ce dernier chemin peut être retiré du code — la décision se
   prend sur cette mesure, pas sur une supposition.
2. **Déclarer un numéro court STOP auprès de Brevo et poser
   `SMS_STOP_SHORTCODE`.** Sans lui, la mention STOP du message reste
   générique (« STOP pour ne plus en recevoir »), sans le numéro que le
   client devrait effectivement composer.
3. **Déclarer chaque expéditeur alphanumérique auprès de l'AF2M** (charte
   AF2M, ≤ 11 caractères, conforme au nom commercial). Sans cette
   déclaration réelle chez le prestataire, `declare_sms_sender` fait
   passer l'expéditeur en base sans que Brevo n'accepte jamais les envois
   sous ce nom — la ligne applicative ment sur l'état réel.
4. **Créer les prix Stripe des packs de crédits SMS** (100/500/2000) et
   les référencer dans les variables d'environnement du catalogue. Un
   pack sans prix configuré n'est simplement pas proposé au commerçant —
   dégradation silencieuse et volontaire, mais qui laisse le canal sans
   moyen de recharge en libre-service tant qu'aucun n'est posé.
5. **Superviser `weekly-digest` après son premier succès en production.**
   Le worker est inscrit au registre de supervision mais volontairement
   laissé `enabled = false` (`docs/bugs.md`, FAIBLE) : le basculer avant
   qu'il n'ait jamais tourné en production ferait sonner une alerte sur
   une absence attendue plutôt que sur une vraie panne. Bascule = un
   `UPDATE` sur `ops_worker_runs`, pas une migration.

**Geste retiré de cette liste le 2026-08-02 — il était déjà fait.** Les
points ci-dessus demandaient historiquement de poser les deux secrets
Vault (`jobs_worker_url`, `sync_contests_secret`) pour faire passer
`lastchance-jobs-worker` d'un passage quotidien à un passage toutes les
5 minutes. **MESURÉ, pas déduit** : le journal du workflow
`production-health.yml` (commit `46c33dc`) rend « Production saine
(0.1.0) : database, workers, security_configuration » à 17h36 UTC ; le
contrôle `workers` de `/api/health` exige `jobs` **et** `sync-contests`
`healthy`, ce qui suppose à la fois les entrées Vault posées et un
battement récent (`tolerance_seconds = 900`, soit 15 min, pour `jobs`) —
or le cron Vercel de secours ne passe qu'à 04h20 UTC, treize heures plus
tôt. Un battement de treize heures ne peut pas satisfaire une tolérance
de quinze minutes : les deux secrets Vault **existent déjà en
production** et le pg_cron toutes les 5 minutes tourne **déjà**. La file
de jobs SMS ne passait donc pas une fois par jour comme cette section
l'a affirmé pendant tout le chantier `chantier/cadence-file`.

Ce que ce chantier (ADR-062, panneau « Cadence des workers »,
`/admin/monitoring`, super_admin) a réellement livré n'est donc pas un
**déblocage** mais une **rotation** : la capacité de reposer ces deux
secrets sans qu'un humain manipule `CRON_SECRET` à la main, par-dessus
une configuration qui fonctionne déjà. Le risque s'en trouve inversé —
un mauvais armement ne débloque plus rien dans le vide, il **casse une
file qui tourne** — ce qui justifie, plutôt que ce n'est plus, les
gardes posées (`checkCadenceEnvironment` : refus hors
`VERCEL_ENV = production`, comparaison d'hôte à
`VERCEL_PROJECT_PRODUCTION_URL` quand elle est exposée ; détail
`docs/decisions.md` ADR-062). Un clic malformé en production
réécrirait une entrée Vault qui alimente aujourd'hui un cron sain.

## 6. Vérifications de référence et garde actuelle

- `npm run migrations:check` vérifie les noms et identifiants numériques
  uniques ainsi que l'alignement de `EXPECTED_MIGRATION`.
- Avec une base Git, le même contrôle refuse les ajouts antérieurs ou égaux à
  l'ancien head et toute modification, suppression ou renommage d'une
  migration existante. La CI lui transmet le SHA de base de la pull request ou
  l'ancien head du push avant de lancer Supabase.
- Le job PostgreSQL démarre ensuite une base Supabase vierge, applique
  l'historique complet et exécute tous les fichiers pgTAP recensés dans
  `supabase/tests/`. Un test unitaire empêche qu'un nouveau fichier pgTAP soit
  oublié dans la commande CI.
- Suite unitaire complète au vert dans la CI de référence.
- `tsc --noEmit`, ESLint : 0 erreur.
- `next build` : succès, `/play/[slug]` reste SSG/ISR.
- E2E : suite complète verte dans la CI de référence sur Supabase local seedé
  (§5.6), avec échec explicite si aucun test ne s'exécute.
