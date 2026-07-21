# Observabilité

Monitoring des erreurs (Sentry), health check et suivi des performances
critiques. **Tout est optionnel et no-op sans configuration** : l'app
fonctionne à l'identique sans aucune variable d'environnement Sentry.

## Vue d'ensemble

| Brique | Rôle | Fichiers |
| --- | --- | --- |
| Sentry serveur | Erreurs Server Components / Actions / Route Handlers + tracing | `sentry.server.config.ts`, `src/instrumentation.ts` |
| Sentry edge | Erreurs et tracing du proxy (middleware) | `sentry.edge.config.ts` |
| Sentry client | Erreurs navigateur + navigations App Router | `src/instrumentation-client.ts`, `src/app/global-error.tsx` |
| Health check | `GET /api/health` — process + base de données + configuration de sécurité | `src/app/api/health/route.ts` |
| Perf critique | Durée, lenteurs et erreurs des opérations métier | `src/lib/monitoring.ts` |

## Installation Sentry

1. Créer un projet **Next.js** sur [sentry.io](https://sentry.io)
   (région EU recommandée pour la conformité RGPD).
2. Récupérer le DSN du projet (Settings → Client Keys).
3. Renseigner les variables d'environnement :

```bash
# .env.local (et Vercel → Settings → Environment Variables)
SENTRY_DSN=https://…@…ingest.de.sentry.io/…          # erreurs serveur + edge
NEXT_PUBLIC_SENTRY_DSN=https://…@…ingest.de.sentry.io/…  # erreurs navigateur (souvent le même DSN)

# Optionnel
SENTRY_ENVIRONMENT=production        # défaut : NODE_ENV
SENTRY_TRACES_SAMPLE_RATE=0.1        # part des requêtes tracées (défaut 0.1)
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
SLOW_OPERATION_THRESHOLD_MS=2000     # seuil « opération lente » (défaut 2000)
```

4. **Source maps** (stack traces lisibles en production, optionnel) —
   uniquement dans l'environnement de build (CI/Vercel), jamais côté client :

```bash
SENTRY_ORG=votre-org
SENTRY_PROJECT=lastchance
SENTRY_AUTH_TOKEN=sntrys_…   # token « Organization Auth Token » Sentry
```

Sans `SENTRY_AUTH_TOKEN`, le build n'uploade rien et reste autonome.

### Ce qui est capturé

- **Serveur** : toute erreur non gérée des Server Components, Server
  Actions et Route Handlers (`onRequestError` dans `src/instrumentation.ts`),
  plus les erreurs explicitement remontées via `reportError()` dans les
  chemins critiques (spin, claim, webhook Stripe) — celles-ci renverraient
  sinon un message générique à l'utilisateur sans laisser de trace.
- **Client** : erreurs non gérées du navigateur et crash du layout racine
  (`src/app/global-error.tsx`, qui affiche aussi un écran de secours).
- **Performances** : transactions échantillonnées (`tracesSampleRate`) —
  temps de réponse des routes, actions et navigations, requêtes lentes
  visibles dans Sentry → Performance.
- `sendDefaultPii: false` partout : ni cookies, ni headers d'auth, ni IP
  ne sont envoyés à Sentry (RGPD).

### Vérifier l'installation

Déclencher une erreur volontaire (par exemple ajouter temporairement
`throw new Error("test sentry")` dans une page), recharger, puis vérifier
qu'elle apparaît dans Sentry → Issues en une minute environ.

## Health check

```
GET /api/health
```

- **200** — process vivant et base Supabase (PostgREST) joignable :

```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2026-07-10T12:05:05.088Z",
  "uptime_s": 6,
  "checks": {
    "database": { "status": "ok", "latency_ms": 25 },
    "security_configuration": { "status": "ok" }
  }
}
```

- **503** — base injoignable, en erreur HTTP ou non configurée
  (`status: "unhealthy"`, détail dans `checks.database.error`), ou
  configuration de sécurité incomplète — Turnstile requis mais non
  configuré, `ADMIN_HOSTS` manquant en production (détail dans
  `checks.security_configuration.error`).

Caractéristiques :

- endpoint public, aucune donnée sensible, jamais mis en cache ;
- exclu du proxy d'authentification (`src/proxy.ts`) : un ping ne
  déclenche aucun appel Supabase Auth ;
- timeout base de 5 s — le check répond toujours, même si la base pend.

Brancher dessus un moniteur d'uptime (UptimeRobot, BetterStack, cron
Vercel…) avec une alerte sur code ≠ 200. La latence base (`latency_ms`)
sert d'indicateur de dégradation avant la panne.

## Monitoring des performances critiques

`src/lib/monitoring.ts` expose deux fonctions, appliquées aux parcours
qui font vivre le produit (spin, claim, webhook Stripe) :

- `monitored(name, fn)` — mesure la durée de l'opération, crée un span
  de tracing Sentry et, au-delà de `SLOW_OPERATION_THRESHOLD_MS`
  (2 s par défaut), émet un `console.warn` **et** un événement Sentry
  de niveau warning (tag `operation`). Contrairement au tracing
  échantillonné, une opération lente est signalée **à 100 %**.
- `reportError(scope, error)` — `console.error` + `Sentry.captureException`
  avec un tag `scope`. À utiliser dans tout `catch` qui renvoie un message
  générique à l'utilisateur.
- `reportSecurityEvent(event, extra)` — événement warning avec le tag
  `security_event` pour captcha/rate limit, incohérences de claim, signatures
  Stripe invalides, dégradation d'abonnement et actions admin sensibles.

Pour instrumenter une nouvelle opération critique :

```ts
import { monitored, reportError } from "@/lib/monitoring";

export async function maNouvelleAction(input: Input) {
  return monitored("domaine.maNouvelleAction", () => impl(input));
}
```

Opérations instrumentées aujourd'hui :

| Nom | Où |
| --- | --- |
| `play.spinWheel` | `src/actions/play.ts` |
| `play.claimPrize` | `src/actions/play.ts` |
| `stripe.webhook` | `src/app/api/stripe/webhook/route.ts` |
| `pronostics.register` | `src/actions/pronostics.ts` |
| `pronostics.update-player` | `src/actions/pronostics.ts` |
| `pronostics.predict` | `src/actions/pronostics.ts` |

## Synchronisation des résultats sportifs (Pronostics)

Le worker `/api/cron/sync-contests` tourne toutes les 10 minutes via
pg_cron côté Supabase (migration `20260721121000`) et le cron Vercel
quotidien reste en filet de sécurité. Signaux disponibles :

| Signal | Où | Sens |
| --- | --- | --- |
| `contests.last_synced_at` | table `contests` | dernière synchro réussie du championnat |
| `contests.last_sync_error` | table `contests` | erreur de la dernière synchro (null si OK) |
| `fixture_cache.fetched_at` | table `fixture_cache` | âge de la copie fournisseur par ligue |
| `fixture_cache.provider_status` / `last_error` | table `fixture_cache` | dernier appel fournisseur : `ok` ou `error` + détail |
| `cron.sync-contests.lag` | événement Sentry | match parti depuis > 3 h toujours sans résultat |

Le rafraîchissement fournisseur est verrouillé par ligue
(`claim_fixture_refresh`) : les requêtes simultanées ne déclenchent
qu'un appel, les autres servent la copie en place.

**Activation du worker 10 min en production** (une fois, SQL editor
Supabase — le job est déjà planifié par la migration et reste inactif
tant que les deux secrets Vault n'existent pas) :

```sql
select vault.create_secret(
  'https://lastchance-mu.vercel.app/api/cron/sync-contests',
  'sync_contests_url');
select vault.create_secret('<CRON_SECRET de Vercel>', 'sync_contests_secret');
```

Contrôle : `select * from cron.job_run_details order by start_time desc
limit 10;` — et `net._http_response` pour les réponses HTTP.

## File de travaux (jobs)

Le worker `/api/cron/jobs` tourne toutes les 5 minutes (pg_cron,
migration `20260722100000` — job `lastchance-jobs-worker`, activation
prod : secret Vault `jobs_worker_url`, l'auth réutilise
`sync_contests_secret`). Signaux :

| Signal | Où | Sens |
| --- | --- | --- |
| `jobs.status` / `last_error` / `attempts` | table `jobs` | cycle de vie de chaque travail (newsletter, relances…) |
| `newsletter_campaigns.status` / `sent_count` | table + journal dashboard | queued → sending → completed / partial / failed, relançable |
| `webhook_deliveries.failed_at` | table + Réglages commerçant | dead-letter (12 tentatives épuisées), rejouable |
| `cron.jobs.*` | événements Sentry | échecs de claim/handler par type |

Requêtes utiles : `select type, status, count(*) from jobs group by 1, 2;`
— et `select count(*) from webhook_deliveries where failed_at is not null
and delivered_at is null;` (dead-letter en attente de rejeu).

## Alertes recommandées (Sentry)

1. **Issues → Alert** : toute nouvelle erreur (first seen) → email.
2. **Nombre d'événements** : > 10 événements d'une même issue en 1 h.
3. **Événements `Opération lente : *`** : > 5 en 1 h → la base ou un
   service externe (Stripe, Resend, Turnstile) se dégrade.
4. **Tag `security_event`** : alerte immédiate sur
   `claim_resource_chain_rejected`, `stripe_invalid_signature` et
   `admin_sensitive_action`; alerte par seuil sur captcha/rate limiting.
5. **Scope `cron.sync-contests.lag`** : un résultat sportif manque plus
   de 3 h après le coup d'envoi — fournisseur muet, mapping cassé ou
   worker à l'arrêt.

## Tests

- `src/lib/monitoring.test.ts` — seuil de lenteur, propagation des
  erreurs, remontée Sentry (SDK mocké).
- `src/app/api/health/route.test.ts` — cas 200, base en erreur, base
  injoignable, Supabase non configuré.

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build` doivent
rester verts.
