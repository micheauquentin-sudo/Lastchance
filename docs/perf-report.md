# Rapport de performance — tests de charge (2026-07-10)

## 1. Méthodologie

Banc de mesure sur le build de production (`next build` + `next start`,
1 instance Node, machine 4 vCPU / 16 Go) :

- **Backend simulé** : ce banc n'a ni Supabase ni Stripe réels. Un mock
  PostgREST local (Node) répond à tous les endpoints utilisés par l'app
  avec une **latence injectée de 8 ms** par requête (ordre de grandeur
  d'un PostgREST + Postgres même région) et instrumente chaque appel
  (compte, percentiles). Le « temps SQL » réel n'est donc pas mesuré —
  il est représenté par cette latence ; les chiffres Supabase ci-dessous
  mesurent le **volume d'appels et la contention côté application**.
- **Stripe** : la vérification de signature du webhook est du HMAC local
  (sub-milliseconde, aucun réseau) — le webhook complet est mesuré avec
  des événements signés uniques par requête. Les appels sortants
  (Checkout/Portal, 1 requête vers api.stripe.com dominée par ~200-400 ms
  de latence Stripe) ne sont pas mesurables sans compte de test.
- **Charge** : autocannon, 100 / 500 / 1000 connexions simultanées,
  20 s par palier. Mémoire échantillonnée sur la RSS du process
  `next-server` toutes les 400 ms.
- Générateur, app et mock partagent les 4 vCPU : les chiffres absolus
  sont pessimistes, les **rapports avant/après** sont la donnée fiable.

## 2. Résultats initiaux (baseline)

`GET /play/[slug]` — le chemin le plus critique (chaque scan de QR) :

| Utilisateurs | req/s | p50 | p95 | p99 | Erreurs |
|---|---|---|---|---|---|
| 100 | 60 | 1 631 ms | 2 908 ms | 2 926 ms | 0 |
| 500 | 50 | 6 503 ms | 8 522 ms | 8 522 ms | 0 |
| 1000 | 50 | 15 037 ms | 15 354 ms | 15 361 ms | 0 |

Autres routes (baseline) : `/api/health` 185-334 req/s ;
`/` (statique) ~390 req/s ; webhook Stripe 151 req/s (p50 325 ms,
50 connexions). RSS : 579 Mo → pic 1 158 Mo pendant `/play` à 1000,
2 495 Mo en fin de campagne (expansion du tas V8, plateau stable —
pas de fuite observée sur les phases suivantes).

### Goulot d'étranglement identifié

- Le débit de `/play` est **plat à ~50-60 req/s quel que soit le nombre
  d'utilisateurs** : la latence explose linéairement avec la file
  d'attente → saturation d'une ressource fixe.
- Le mock Supabase reste à p50 8 ms / p95 ≤ 31 ms pendant ce temps :
  **le backend n'est pas le goulot**.
- `next-server` plafonne à ~200 % CPU (thread JS + GC) : **le rendu SSR
  React (~17 ms de CPU/requête) sature le thread JS unique**, alors que
  la page produite est identique pour tous les visiteurs d'un même slug.
- Aggravant : chaque vue coûtait **6 appels Supabase** (1 qr_codes +
  3 requêtes séquentielles campaigns/organizations/wheels + prizes +
  1 RPC compteur), soit 2 allers-retours DB séquentiels de latence pure.

## 3. Correctifs appliqués

1. **`loadPlayContext` : 3 allers-retours → 1** (`src/lib/play-context.ts`).
   Requête PostgREST imbriquée via les FK
   (`qr_codes → organizations / campaigns → wheels → prizes`), filtre et
   tri des lots côté Node. Vérifié : les poids (`weight`) ne fuient
   toujours pas au client (test e2e dédié au vert).
2. **`/play` passe en ISR 30 s** (`revalidate = 30` +
   `generateStaticParams` vide). Le HTML d'un slug est servi depuis le
   cache et re-généré au plus toutes les 30 s. Sans risque d'autorité :
   le spin (server action) revalide déjà campagne/abonnement/stock au
   moment de jouer ; une pause commerçant apparaît en ≤ 30 s.
3. **Comptage de scans découplé du rendu** : `<ScanBeacon />` (client)
   envoie `POST /api/scan?slug=…` via `sendBeacon` à chaque chargement
   navigateur — la sémantique « 1 chargement = 1 scan » est conservée
   (elle aurait été cassée par l'ISR), et la route est exclue du proxy
   d'auth comme `/api/health`.

## 4. Résultats après correctifs

`GET /play/[slug]` :

| Utilisateurs | req/s | p50 | p95 | p99 | Gain débit |
|---|---|---|---|---|---|
| 100 | **754** | 119 ms | 152 ms | 176 ms | ×12,5 |
| 500 | **808** | 609 ms | 780 ms | 800 ms | ×16 |
| 1000 | **851** | 1 126 ms | 1 244 ms | 1 262 ms | **×17** |

- p99 à 1000 utilisateurs : **15,4 s → 1,26 s**. Zéro erreur à tous les
  paliers (la baseline provoquait des resets de connexions résiduels).
- **Appels Supabase pour `/play` : 6 par vue → 1 par slug par 30 s**
  (+ 1 RPC de comptage par vue réelle, hors chemin critique).
- `/api/scan` (beacon) : 413 req/s à 100 connexions, p50 232 ms —
  fire-and-forget côté navigateur, n'affecte pas l'expérience joueur.
- Webhook Stripe : 173 req/s, p50 282 ms (signature HMAC sub-ms +
  3 écritures Supabase) — largement au-delà du débit d'événements réel.
- Mémoire : pic pendant `/play` à 1000 : **1 158 Mo → 450 Mo** ;
  fin de campagne 2 495 Mo → 1 698 Mo.
- Suite e2e du parcours joueur (3 tests, Chromium) au vert contre le
  banc ; 98 tests unitaires, typecheck, lint, build inchangés.

## 5. Limites et recommandations

- Temps SQL réels non mesurés (latence simulée fixe 8 ms) : à re-mesurer
  contre le vrai Supabase en staging (`checks.database.latency_ms` du
  health check donne déjà cette mesure en continu).
- 1 instance Node = 1 thread JS pour le SSR : en production (Vercel/
  serverless), la montée en charge est aussi horizontale. Les ~850 req/s
  mesurés sont un plancher par instance.
- Mettre un CDN devant `/play` (le cache ISR devient alors distribué).
- Cadrer la mémoire du conteneur de prod (`--max-old-space-size`) : le
  tas V8 s'étend sous rafale et ne redescend pas (comportement normal,
  mais à dimensionner).
- Slugs inconnus : chaque slug invalide crée une entrée de cache ISR
  30 s (page « Oups »). Bruit borné (petites entrées, expiration), à
  surveiller si un scan massif d'URLs apparaît dans les logs.
