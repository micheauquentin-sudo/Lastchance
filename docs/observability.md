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
| Health check | `GET /api/health` — process + base de données + workers fréquents + configuration de sécurité | `src/app/api/health/route.ts` |
| Santé des workers | Registre des crons supervisés, heartbeats, fraîcheur | `supabase/migrations/20260805240000_worker_observability_scale.sql`, `src/lib/worker-health.ts` |
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
  plus toute erreur **rattrapée** et remontée via `reportError()`. La règle
  tient en une phrase : un `catch` qui renvoie un message générique appelle
  `reportError()`, sinon la panne n'existe pour personne — le commerçant
  lit « une erreur est survenue » et le monitoring, lui, ne voit rien. Le
  motif ne se limite pas au spin et au webhook Stripe : il est appliqué
  dans plusieurs centaines de `catch`, et la liste vivante se lit par
  `grep -rn "reportError(" src/`.
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

**Trois contrôles, tous les trois bloquants** : la base, **les workers
fréquents** et la configuration de sécurité. Le contrôle des workers est
celui qu'on oublie en lisant le mot « health check » — il fait pourtant
répondre 503 à lui seul, et c'est délibéré : une plateforme dont la file
de travaux ne tourne plus est en panne pour le commerçant (sa newsletter
reste en file, son résultat sportif n'arrive jamais) alors même que toutes
les pages répondent 200. Sans ce contrôle, le moniteur d'uptime resterait
vert pendant toute la durée de l'incident.

- **200** — process vivant, base Supabase (PostgREST) joignable et workers
  fréquents actifs :

```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2026-07-10T12:05:05.088Z",
  "uptime_s": 6,
  "checks": {
    "database": { "status": "ok", "latency_ms": 25 },
    "workers": { "status": "ok", "latency_ms": 18 },
    "security_configuration": { "status": "ok" }
  }
}
```

- **503** (`status: "unhealthy"`) dès qu'**un seul** des trois contrôles
  échoue. Causes réelles, avec le message exact renvoyé dans
  `checks.<contrôle>.error` :

| Contrôle | `error` | Cause |
| --- | --- | --- |
| `database` | `Supabase non configuré` | `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` absent |
| `database` | `HTTP <code>` | PostgREST joignable mais répond en erreur |
| `database` | message de l'exception réseau, à défaut `échec de connexion` | base injoignable ou muette au-delà de 5 s |
| `workers` | `Workers non configurés` | en production, mêmes variables Supabase absentes |
| `workers` | `État des workers indisponible` | la RPC `ops_workers_health` a échoué, dépassé 5 s, ou répondu autre chose que 200 |
| `workers` | `Workers non opérationnels` | `jobs` ou `sync-contests` n'est pas `healthy` |
| `security_configuration` | `Protection anti-bot incomplète` | Turnstile requis mais non configuré |
| `security_configuration` | `ADMIN_HOSTS manquant` | en production uniquement |

Le message des workers est **le même quel que soit le worker en défaut**,
et c'est voulu : l'endpoint est public, nommer « sync-contests » dirait à
un inconnu quelle partie de la plateforme est à terre à cet instant. Un
test verrouille cette discrétion (`route.test.ts` vérifie que le corps de
la réponse ne contient pas le nom du worker). Le diagnostic se fait au
back-office `/admin/monitoring`, qui nomme le worker **et** sa raison.

Caractéristiques :

- endpoint public, aucune donnée sensible, jamais mis en cache ;
- exclu du proxy d'authentification (`src/proxy.ts`) : un ping ne
  déclenche aucun appel Supabase Auth ;
- timeout de 5 s sur chacun des deux appels réseau, joués **en parallèle**
  — le check répond toujours, même si la base pend ;
- **hors production, le contrôle des workers est réputé vert** : en local
  et dans les previews, Vault n'a pas les secrets des crons ; un rouge
  permanent aurait fini par être ignoré, y compris le jour où il aurait
  dit quelque chose de vrai.

Brancher dessus un moniteur d'uptime (UptimeRobot, BetterStack, cron
Vercel…) avec une alerte sur code ≠ 200. La latence base (`latency_ms`)
sert d'indicateur de dégradation avant la panne.

### Ce que « workers sains » veut dire

La RPC `ops_workers_health()` (définition vivante dans
`20260805240000_worker_observability_scale.sql` — celle de
`20260805120000` est périmée) croise le registre
`ops_worker_definitions` avec les heartbeats `ops_worker_runs`.

Le registre est **de la donnée, pas du code** : brancher ou débrancher la
supervision d'un worker est un `update … set enabled` en production, pas
une migration. Deux workers y sont supervisés aujourd'hui, exactement ceux
que le healthcheck exige — `jobs` (période 300 s, tolérance 900 s, file
déclarée en retard au-delà de 30 min) et `sync-contests` (600 s / 1800 s).
Les six autres (`reengage`, `purge-data`, `webhooks`, `automations`,
`calendar-reminders`, `jackpot-draws`) sont **enregistrés mais
`enabled = false`** : leurs routes écrivent déjà leur heartbeat, mais leur
silence dégrade la supervision sans rendre la plateforme indisponible — les
compter dans le healthcheck ferait tomber la production entière pour un
e-mail de relance non parti. Les basculer se fait donc worker par worker,
quand on est prêt à traiter leur rouge.

Avant d'en activer un, vérifier sa période déclarée : le registre les
inscrit tous à 86 400 s, ce qui vaut pour les crons Vercel quotidiens. Pour
`jackpot-draws`, cette valeur est **volontairement correcte telle quelle**
(revue sécurité M1 du wagon 7, ADR-108) — un premier réflexe aurait été de
la descendre à 300 s au motif qu'un pg_cron (`lastchance-jackpot-date-draws`)
déclenche `run_jackpot_date_draws()` toutes les 5 minutes, mais ce pg_cron
exécute la fonction directement en SQL et n'écrit **aucune** ligne dans
`ops_worker_runs` : le seul heartbeat de ce worker vient de la route HTTP
quotidienne `/api/cron/jackpot-draws` (`vercel.json`, `45 4 * * *`). Une
période à 300 s aurait rendu le capteur rouge ~23 h 45 sur 24 dès
l'application. Superviser le chemin pg_cron des 5 minutes demanderait que
`run_jackpot_date_draws()` écrive son propre heartbeat — chantier futur non
fait, consigné dans `docs/bugs.md` (wagon 7).

Quand un worker n'est pas `healthy`, la colonne `reason` dit pourquoi :
`vault_missing` (secrets Vault absents, le cron n'est même pas
déclenchable), `never_succeeded`, `last_run_failed` / `last_run_degraded`,
`heartbeat_stale` (aucun succès dans la tolérance) ou `job_backlog_stale`
(le plus vieux job dû dépasse le seuil). Ce vocabulaire n'est visible que
du back-office, jamais de l'endpoint public.

## Monitoring des performances critiques

`src/lib/monitoring.ts` expose quatre helpers, appliqués aux parcours qui
font vivre le produit :

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
- `recordCounter(name)` — compte une occurrence qui n'a pas de durée
  propre (`duration_ms = 0`, `ok = true`). Volontairement dans la même
  table `ops_metrics` que `monitored()` : un compteur n'a pas mérité sa
  table, et il hérite ainsi de la purge à 30 j, de la synthèse et du
  back-office. C'est le **nombre de lignes** qui porte l'information, et
  zéro ligne est la valeur saine — voir les compteurs
  `rewards.registry_miss.<famille>` et `rewards.registry_error`, qui
  mesurent si le repli historique de la caisse sert encore.

Pour instrumenter une nouvelle opération critique :

```ts
import { monitored, reportError } from "@/lib/monitoring";

export async function maNouvelleAction(input: Input) {
  return monitored("domaine.maNouvelleAction", () => impl(input));
}
```

Chaque appel `monitored()` écrit aussi durée + issue dans la table
`ops_metrics` (service role, purge 30 j) : le back-office
(/admin/monitoring) en tire p50/p95 et taux d'erreur réels sur 24 h,
l'évaluation des objectifs de service, la santé des workers
(`ops_workers_health`), l'état des crons pg_cron (`cron_last_success`) et
l'écart migrations attendue/appliquée (`applied_migrations_info` vs
`EXPECTED_MIGRATION`).

**La liste des objectifs n'est pas recopiée ici** : elle vit dans le
tableau `slos` de `src/lib/admin/ops.ts`, et l'énumérer dans un document
revient à garantir qu'elle sera fausse — celle qui figurait à cet endroit
en citait quatre quand le code en évaluait déjà sept. Chaque objectif
porte sa propre `key` et son `label` lisible, affichés tels quels au
back-office : c'est cet écran qui fait foi.

### Prévenir la dérive des migrations

Le signal du back-office détecte une base déployée en retard, mais la CI
empêche d'abord de produire un historique SQL ambigu :

- `npm run migrations:check` exige des noms valides, des identifiants
  numériques uniques et un `EXPECTED_MIGRATION` égal au dernier head ;
- la « base immuable » protégée n'est **aucun numéro écrit quelque part** :
  c'est l'état du dossier `supabase/migrations` au commit de référence —
  la branche de base pour une pull request, l'ancien head fourni par
  l'événement GitHub pour un push. Le garde ne code en dur aucun
  identifiant, précisément pour ne pas se périmer à chaque migration ;
- toute migration nouvelle doit porter un identifiant strictement
  supérieur au dernier head déjà présent dans cette base ;
- toute modification, suppression ou renommage d'une migration présente dans
  cette base fait échouer le job : une correction passe toujours par une
  nouvelle migration ;
- seulement après ce contrôle, `supabase start` recrée une base vierge,
  applique l'historique complet, puis la CI exécute tous les fichiers pgTAP.

Ainsi, `EXPECTED_MIGRATION` reste le signal de déploiement, tandis que la
reconstruction sur base vierge prouve que l'historique reste applicable de
bout en bout.

### Quelles opérations sont instrumentées

**Ne pas recopier la liste ici.** Ce document a porté pendant des mois un
tableau de six opérations alors que le code en comptait quarante et une :
un inventaire tenu à la main se périme au chantier suivant, et un
inventaire faux coûte plus cher que pas d'inventaire du tout, parce qu'on
le croit — on conclut « ce parcours n'est pas mesuré » d'une absence qui
n'était qu'un oubli de mise à jour.

Le **critère**, lui, est stable : passe par `monitored()` toute opération
dont la lenteur ou l'échec se voit du joueur ou du commerçant sans laisser
de trace ailleurs — chaque action publique des parcours joueur (roue,
quiz, fidélité, chasse au trésor, jackpot, événement live, calendrier,
parrainage, pronostics, méta-progression, jeux skill-gated), le webhook
Stripe, et les workers à cadence courte. Le nom suit toujours
`domaine.opération` : cette chaîne est la clé dans `ops_metrics` **et** le
tag Sentry, la renommer coupe l'historique des mesures en deux.

La **liste vivante** se lit du code, jamais d'ici :

```bash
grep -rn 'monitored("' src/ --include='*.ts' | grep -v '\.test\.'
```

Deux nuances que ce grep ne dit pas, et qu'il faut connaître avant de lire
un p95 comme s'il couvrait tout le produit :

- les huit routes `src/app/api/cron/*` écrivent toutes leur heartbeat
  (`startWorkerRun*`), mais **quatre seulement** passent par `monitored()`
  — `jobs`, `sync-contests`, `automations`, `calendar-reminders`. Les
  quatre autres (`purge-data`, `reengage`, `webhooks`, `jackpot-draws`)
  ne remontent que leurs erreurs : leur durée n'entre pas dans
  `ops_metrics`, et leur régularité se juge sur `ops_worker_runs` ;
- les actions du dashboard commerçant (facturation, campagnes, lots,
  équipe, QR codes, newsletter…) ne sont pas instrumentées : le taux
  d'erreur affiché au back-office porte sur les parcours joueur et les
  workers, pas sur l'espace commerçant.

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

**Activation du worker 10 min en production** — **mesuré actif le
2026-08-02** (voir « File de travaux » ci-dessous : la sonde
`production-health.yml` prouve que les deux secrets Vault existent déjà
et que le pg_cron toutes les 5 minutes tourne déjà, contrairement à ce
que cette section a longtemps affirmé). Depuis le 2026-08-01 (ADR-062),
le panneau « Cadence des workers » (`/admin/monitoring`, super_admin)
pose ces secrets sans SQL manuel — il ne débloque plus une file inerte,
il en **fait la rotation**. Méthode manuelle conservée ci-dessous (SQL
editor Supabase, pour une rotation hors panneau) :

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
`sync_contests_secret`) ; le cron Vercel quotidien reste en filet de
sécurité. **Confirmé actif en production le 2026-08-02** par la sonde
`production-health.yml` (healthcheck vert avec un battement `jobs`
inférieur à 15 min, alors que le seul filet Vercel passe une fois par
jour) — les secrets Vault sont déjà posés, ce n'est plus une condition
à réunir. C'est l'un des deux workers dont l'arrêt fait répondre **503**
au healthcheck : voir plus haut, une file qui ne se vide plus est une
panne pour le commerçant même quand le site répond. Signaux :

| Signal | Où | Sens |
| --- | --- | --- |
| `jobs.status` / `last_error` / `attempts` | table `jobs` | cycle de vie de chaque travail (newsletter, relances…) |
| `newsletter_campaigns.status` / `sent_count` | table + journal dashboard | queued → sending → completed / partial / failed, relançable |
| `webhook_deliveries.failed_at` | table + Réglages commerçant | dead-letter (12 tentatives épuisées), rejouable |
| `cron.jobs.*` | événements Sentry | échecs de claim/handler par type |

Requêtes utiles : `select type, status, count(*) from jobs group by 1, 2;`
— et `select count(*) from webhook_deliveries where failed_at is not null
and delivered_at is null;` (dead-letter en attente de rejeu).

### Drain des livraisons webhook

Le drain de `webhook_deliveries` (`src/lib/webhook-worker.ts`), partagé par
`/api/cron/jobs` et `/api/cron/webhooks`, réclame **8 livraisons par
passage** — pas 50 : chaque livraison est un appel sortant vers un endpoint
tiers dont la durée n'appartient pas à ce code, et un lot de 50 endpoints
lents pouvait épuiser la fonction (`maxDuration = 60 s`) au milieu d'une
livraison, sans réponse ni clôture. La boucle teste l'horloge avant chaque
livraison (`budgetMs`, 45 s côté `/api/cron/webhooks`) : le reliquat coupé
par le budget est **relâché** (`deferred`, `locked_until` remis à `null`) et
repart au passage suivant. La cadence réelle est celle de `/api/cron/jobs` —
toutes les 5 minutes en production via pg_cron (`lastchance-jobs-worker`,
secrets Vault posés) — et non celle du cron Vercel quotidien de
`/api/cron/webhooks`, qui reste un filet de sécurité.

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
  injoignable, Supabase non configuré, workers sains en production, et
  workers dégradés **sans que le nom du worker fuite** dans la réponse :
  cette dernière assertion est la garde de discrétion de l'endpoint
  public, la retirer rendrait la fuite silencieuse.
- `src/lib/worker-health.test.ts` — ouverture/clôture des heartbeats et
  variantes « safely » qui ne doivent jamais faire échouer le travail
  métier qu'elles observent.
- `src/lib/admin/ops.test.ts` — évaluation des objectifs de service.
- `supabase/tests/ops_monitoring.test.sql` — `ops_workers_health()`
  contre un vrai Postgres : c'est le seul endroit où les seuils de
  fraîcheur sont réellement prouvés.

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build` doivent
rester verts.
