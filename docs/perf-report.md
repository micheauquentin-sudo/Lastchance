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
3. **Comptage d'ouvertures découplé du rendu** : `<PageOpenBeacon />` (client)
   envoie `POST /api/page-opens?slug=…` via `sendBeacon` à chaque chargement
   navigateur — la sémantique « 1 chargement = 1 ouverture » est conservée
   (elle aurait été cassée par l'ISR), et la route est exclue du proxy
   d'auth comme `/api/health`.

   *Nommés `ScanBeacon` et `/api/scan` jusqu'au 2026-08-06.* Le mot « scan »
   promettait une mesure d'acquisition physique là où le chiffre compte des
   chargements — rechargement, retour arrière et lien partagé inclus (ADR-083).

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
- `/api/page-opens` (beacon, mesuré sous le nom `/api/scan`) : 413 req/s à
  100 connexions, p50 232 ms — fire-and-forget côté navigateur, n'affecte pas
  l'expérience joueur.
- Webhook Stripe : 173 req/s, p50 282 ms (signature HMAC sub-ms +
  3 écritures Supabase) — largement au-delà du débit d'événements réel.
- Mémoire : pic pendant `/play` à 1000 : **1 158 Mo → 450 Mo** ;
  fin de campagne 2 495 Mo → 1 698 Mo.
- Suite e2e du parcours joueur (3 tests, Chromium) au vert contre le
  banc ; 98 tests unitaires, typecheck, lint, build inchangés.

## 5. Passe React / Next.js côté rendu (2026-07-10)

Audit du rendu React (re-renders, Server Components, Suspense, cache,
duplication). Constat : l'architecture est saine — dashboard 100 %
Server Components, interactivité isolée dans des composants clients
feuilles, `getUserAndOrg` dédupliqué via `React.cache()`. Correctifs
appliqués (uniquement ce qui apporte un gain mesurable) :

1. **Cache ISR `/play` purgé à la modification** (`src/lib/revalidate-play.ts`) :
   les server actions (lots, style de roue, statut/engagement/claim de
   campagne, logo, suppression QR/campagne) appellent
   `revalidatePlaySlugs()` — les changements du commerçant sont visibles
   immédiatement au lieu d'attendre la fenêtre ISR de 30 s (qui reste le
   filet pour tout le reste, ex. coupure d'abonnement via webhook Stripe).
2. **Allers-retours Supabase séquentiels parallélisés** :
   participations (3 → 1 aller-retour de latence), détail campagne
   (2 → 1, requêtes parallèles), configuration roue (2 → 1, embed
   `wheels → prizes` + tri Node, même idiome que `/play`).
3. **`loading.tsx` sur le segment `/dashboard`** : squelette streamé
   instantanément pendant les requêtes serveur — la navigation entre
   onglets ne fige plus sans retour visuel.
4. **`formatDate` réutilise un `Intl.DateTimeFormat`** au niveau module
   (la page participations en construisait jusqu'à 400 par rendu).
5. **Dédoublonnage des éditeurs** (`editor-controls.tsx`) : sélecteur de
   couleur, bouton de preset à pastilles, sélecteur de police et
   feuilles Google Fonts partagés entre l'éditeur de roue et d'affiche
   (~90 lignes dupliquées supprimées).

Non retenus, délibérément : `React.memo`/`useCallback` supplémentaires
(aucun re-render coûteux réel : les aperçus doivent se redessiner à
chaque frappe et `WheelSvg` est bon marché), React Compiler (gain
marginal ici pour un risque de chaîne de build), découpage des « gros »
composants (≤ 400 lignes, cohésifs).

Vérification : 98 tests unitaires, typecheck, lint et build au vert ;
`/play/[slug]` reste SSG/ISR au build.

## 5 bis. Mesure sur la pile RÉELLE (2026-08-06) — ce que les chiffres ci-dessus ne disaient pas

**Tout ce qui précède a été mesuré contre un Supabase SIMULÉ** (latence
injectée de 8 ms, cf. §1). Première mesure contre la production réelle, via
`npm run capacity:bench` (`scripts/capacity-bench.mjs`), sur `/api/health` —
route `force-dynamic` qui fait deux appels Supabase, donc représentative des
**server actions** (spin, claim, tampon) et non du `/play` mis en cache :

| Connexions | req/s | p50 | p95 | p99 | Erreurs | Région |
|---|---|---|---|---|---|---|
| 5 | **9** | 540 ms | 744 ms | 784 ms | 0 % | `iad1` |
| 15 | **11** | 1 220 ms | 2 236 ms | 3 023 ms | 0 % | `iad1` |

Latence Supabase **vue depuis la fonction** : p50 **638 ms**, p95 1 663 ms,
p99 1 835 ms (n = 135). Démarrage à froid mesuré à **1 859 ms**.

**Première cause, réelle mais MINORITAIRE** : `X-Vercel-Id: cdg1::iad1::…` —
les fonctions s'exécutaient à Washington (`iad1`, valeur par défaut de Vercel
pour tout nouveau projet) alors que le projet Supabase est à Francfort
(`eu-central-1`). Correctif appliqué : `"regions": ["fra1"]` dans `vercel.json`
— disponible sur le plan Hobby, qui autorise une région unique mais
**sélectionnable**.

### Après le correctif de région — et pourquoi ce n'était pas la vraie cause

| Connexions | req/s | p50 | p95 | p99 | Région |
|---|---|---|---|---|---|
| 5 | 13 | 384 ms | 524 ms | 591 ms | `fra1` |
| 15 | 12 | 1 183 ms | 1 902 ms | 2 286 ms | `fra1` |

Latence Supabase vue depuis la fonction : p50 **499 ms** (contre 638 ms avant).
Gain réel, mais **~25 % seulement** : 499 ms entre deux machines du même
datacenter ne s'expliquent pas par le réseau. Trois mesures ont tranché :

1. **Supabase interrogé DIRECTEMENT** (hors Vercel, depuis un poste en France) :
   TTFB **65-90 ms** dont ~50 ms de poignée TLS, soit ~30-40 ms de service.
   À **10 requêtes parallèles** : 82-161 ms, aucune dégradation. La base n'est
   pas le goulot, et elle ne sature pas.
2. **Fonction CHAUDE, appels séquentiels** (`uptime_s` 88-92 s) : la latence
   base tombe à **127-152 ms** après quelques appels. C'est le vrai coût d'un
   appel Supabase depuis une fonction déjà chaude.
3. **15 requêtes parallèles** : les réponses ne viennent que de **trois
   instances** (`uptime_s` groupés à 85 s, 93-94 s, 151 s), et la latence base
   y monte à **689-933 ms**. Même base, même région, même instant — seule la
   concurrence par instance a changé.

**Première conclusion, et elle était FAUSSE** — consignée ici parce qu'elle a
coûté un détour et que la suite ne se comprend pas sans elle : « le goulot est
le thread JS de la fonction et le nombre d'instances du plan Hobby ». Les
observations étaient exactes, l'attribution ne l'était pas.

### La vraie cause : la sonde mesurait surtout son propre coût

`checkDatabase` interrogeait la **racine `/rest/v1/`**, qui fait générer à
PostgREST la **spec OpenAPI du schéma entier** à chaque appel — des dizaines de
tables décrites pour prouver qu'une connexion répond. Le signe était sous les
yeux depuis le début : `workers` (une vraie RPC) ressortait deux fois plus
rapide que `database` (un « simple GET »). Un GET plus lent qu'une RPC ne
s'explique que par un GET qui n'est pas simple.

Sonde remplacée par une lecture bornée (`organizations?select=id&limit=1`).
Même déploiement, même région, même base, même banc :

| Connexions | Sonde racine OpenAPI | Sonde bornée |
|---|---|---|
| 5 | 13 req/s · p50 384 ms | **60 req/s · p50 78 ms** |
| 15 | 12 req/s · p50 1 183 ms | **175 req/s · p50 73 ms** |
| 40 | — | **334 req/s · p50 104 ms · p99 696 ms** |

Latence Supabase vue depuis la fonction : **499 ms → 35 ms** de p50, p99
122 ms (n = 4 609). Zéro erreur à tous les paliers.

**Ce qu'il faut en retenir** :

1. **Le plafond de 12 req/s n'existait pas.** C'était le coût de la sonde,
   pas celui de la plateforme. Vercel Hobby sert **334 req/s** sur un chemin
   dynamique qui touche la base.
2. **Un indicateur de santé qui coûte cher ne dit pas la vérité sur ce qu'il
   surveille** — et il l'a dite à l'envers pendant toute une campagne de
   mesure, en désignant successivement la région, puis Vercel.
3. La **région comptait quand même** (499 → 35 ms n'aurait pas été atteint
   depuis `iad1`), mais elle ne valait qu'environ un quart de l'écart.

**Limite de cette mesure** : `/api/health` fait UNE lecture bornée. Un `spin`
réel fait davantage — contexte, seaux de débit, RPC atomique, signature de
jeton.

### Un chemin d'ÉCRITURE, mesuré en production

Le `spin` lui-même **ne se mesure pas en production, et c'est voulu** :
`verifyTurnstile` est fail-closed et exige un jeton Cloudflare qu'aucun script
ne peut forger. Le substitut le plus proche est `POST /api/page-opens` — même
famille de travail que la section de gardes d'un spin (un seau de débit en
`upsert`, puis une RPC), sur un chemin `force-dynamic`, sans challenge :

| Connexions | req/s | p50 | p95 | p99 | Erreurs |
|---|---|---|---|---|---|
| 5 | 45 | 103 ms | 161 ms | 253 ms | 0 % |
| 15 | 120 | 95 ms | 169 ms | 1 262 ms | 0 % |
| 40 | **409** | 80 ms | 147 ms | 566 ms | 0 % |

Le banc y fait tourner des **slugs synthétiques** sur 40 seaux : aucune
statistique de commerçant n'est touchée, et le seau `scanIp` (60/60 s, clé sur
slug + IP) ne s'auto-limite pas au milieu de la mesure — avec un slug unique on
aurait mesuré le refus en croyant mesurer le chemin complet.

**Un chemin dynamique qui ÉCRIT en base sert donc 409 req/s, sans erreur.** Un
spin fait davantage de travail que cela ; l'ordre de grandeur restant à établir
est un facteur, pas un ordre.

### Le SPIN réel, mesuré en local (2026-08-07)

`scripts/bench-spin-local.sh` — Supabase local seedé, build de production,
`TURNSTILE_REQUIRED=false`, server action appelée par le protocole Next-Action,
**un cookie joueur neuf par requête**. Le même banc mesure `beacon` dans le même
environnement : c'est le RAPPORT entre les deux qui se transpose, pas le chiffre
brut d'une VM de développement qui partage ses cœurs entre le générateur de
charge, Postgres et Next.

| Connexions | Écriture simple | **Spin réel** | Rapport |
|---|---|---|---|
| 5 | 104 req/s · p50 46 ms | **21 req/s** · p50 207 ms | ×5,0 |
| 15 | 113 req/s · p50 126 ms | **24 req/s** · p50 584 ms | ×4,7 |
| 40 | 160 req/s · p50 229 ms | **25 req/s** · p50 1 465 ms | ×6,4 |

Zéro erreur à tous les paliers. **801 tours réellement enregistrés dans
`public.spins`** — le banc a bien mesuré des tours complets, pas des refus (une
sonde préalable exige un tour gagnant avant que la mesure ne démarre).

**Transposition sur la production** : un spin coûte **5 à 6 fois** une écriture
simple. La production sert 409 req/s en écriture à 40 connexions, ce qui situe
le spin autour de **60-65 req/s** dans les mêmes conditions. C'est une
transposition par rapport, pas une mesure directe — la seule possible tant que
Turnstile protège la production, et il doit continuer à la protéger.

**LE PLATEAU EST L'INFORMATION, PAS LE CHIFFRE.** Le spin reste à ~21-25 req/s
quelle que soit la concurrence, pendant que la latence croît linéairement : la
signature d'une ressource sérialisée. La cause est probablement le **décrément
de stock sur UNE ligne de lot** — la roue du seed porte un lot gagnant à poids
100 et un perdant à poids 0, donc **100 % des tours verrouillent la même ligne**.
Une roue réelle répartit ses tirages sur plusieurs lots et contend d'autant
moins. Ce chiffre est donc un **pire cas**, à ne pas lire comme le débit d'une
roue ordinaire — mais c'est exactement la forme d'une animation à lot unique
très demandé, et c'est là qu'il faut le garder en tête.

Ce que cela ne dit pas : la correction sous concurrence (deux joueurs sur le
dernier lot, stock négatif, jeton rejoué). Elle est prouvée ailleurs, par
`scripts/concurrency-probe.mjs`, et ce banc ne la remplace pas.

## 7. La jauge 1 000 de « La Totale » — éprouvée, et NON tenue (2026-08-07)

L'offre `full` vend **1 000 participants simultanés**. Le catalogue portait déjà
la règle « ne pas vendre de jauge supérieure avant un benchmark de capacité live
concluant » (`src/lib/plans.ts`). Le benchmark a eu lieu. **Il n'est pas
concluant.**

### La garde de capacité, elle, est correcte

1 000 joins par la RPC réelle `join_event_session`, puis un 1001ᵉ :

| Contrôle | Résultat |
|---|---|
| `event_participant_capacity` de l'organisation | **1000** |
| `max_participants` figé à la session | **1000** |
| Joueurs réellement inscrits | **1000** |
| Verdict du 1001ᵉ | **`{"state": "full", "capacity": 1000}`** |

Rien à corriger de ce côté : la jauge est appliquée, pas seulement affichée.

### Ce que 1 000 joueurs coûtent RÉELLEMENT

Un participant n'est pas une requête, c'est un **rafraîchissement continu**.
`eventPollDelay` (`src/lib/event-realtime-contract.ts`) fixe la cadence par
joueur, et **Realtime est absent de la production** (aucune variable
`EVENTS_REALTIME_ENABLED`) :

| Phase | Realtime coupé | Realtime actif |
|---|---|---|
| Lobby | 5 000 ms | 5 000 ms |
| **Question en cours** | **2 500 ms** | 30 000 ms |
| Révélation / classement | 5 000 ms | 30 000 ms |

Soit, pendant une question : **1 000 joueurs ⇒ 400 req/s soutenues** sur
`getEventState`. À 500 joueurs, 200 req/s. À 100, 40 req/s.

### Mesure (local, session réelle en `question_active`)

| Salle | 20 conn | 60 conn | 150 conn |
|---|---|---|---|
| **1 000 joueurs** | 26 req/s · p50 721 ms | 22 req/s · p50 2 015 ms | **15 req/s · p50 10 496 ms** |
| **5 joueurs** | 46 req/s · p50 393 ms | 52 req/s · p50 1 004 ms | — |

Zéro erreur partout — la pile ne tombe pas, elle rallonge. **Le débit DIMINUE
quand la concurrence augmente** (26 → 22 → 15) et la latence atteint dix
secondes : ce n'est pas un plateau, c'est un effondrement.

**Deux causes, et la seconde n'est pas celle qu'on croit.** Le nombre de
joueurs divise bien le débit par deux (46 → 26), donc il existe un coût en
O(participants). Mais une salle QUASI VIDE plafonne déjà à ~50 req/s : le gros
de l'écart vient du **coût de base de `getEventState`**, pas de l'agrégation du
classement.

### ⚠️ CES CHIFFRES ABSOLUS NE SONT PAS COMPARABLES ENTRE DEUX RUNS (2026-08-08)

Le tableau ci-dessus a été mesuré un soir donné. Le lendemain, **le même code
sur la même session de 1 000 joueurs rend 54 à 61 req/s** au lieu de 26. Rien
n'avait changé dans l'application : seule la machine avait changé d'état
(builds, resets et bancs enchaînés pendant des heures, mémoire disponible
passée de 5,0 à 3,1 Go).

**Conséquence de méthode, à retenir avant tout le reste** : sur cette machine,
un écart d'un facteur deux entre deux campagnes ne prouve rien. Seule une
comparaison **dos à dos** — un seul build, un seul état de base, deux serveurs
successifs dans la même minute — permet d'attribuer un écart à un correctif.
Les conclusions tirées de deux runs distants dans le temps sont à jeter.

C'est ce qui a été fait pour évaluer le cache d'état partagé ci-dessous, et ce
qui a évité d'attribuer au correctif ce qui revenait à la fatigue de la machine
(un premier essai concluait à une DÉGRADATION de moitié ; l'A/B a montré
l'inverse).

### Le cache d'état partagé : gain RÉEL mais MODESTE

Découpage `event_etat_partage` (commun à la salle, cacheable 1 s) /
`event_etat_joueur` (personnel, jamais cacheable) — migration `20260919120000`.
Équivalence prouvée : `partagé + personnel` reproduit exactement
`event_public_state`, avec jeton et sans jeton.

A/B dos à dos, 1 000 joueurs, phase question, le chemin historique passant en
PREMIER (donc avantagé par une machine plus fraîche) :

| Connexions | Sans cache | Avec cache | Écart |
|---|---|---|---|
| 20 | 54 req/s · p50 365 ms | **63 req/s · p50 299 ms** | +17 % |
| 60 | 61 req/s · p50 920 ms | **62 req/s · p50 874 ms** | +2 % |

**Le classement n'était donc pas le goulot.** Le cache supprime un des trois
allers-retours base par poll et ne gagne que ~10 % : le coût dominant est
ailleurs — `loadEventActionContext`, l'écriture du compteur de pression
(`observeEventPressure` écrit en base à CHAQUE poll), et l'enveloppe de la
server action elle-même.

### Verdict par palier

Transposition vers la production au rapport observé sur le chemin d'écriture
(local 160 → prod 409, soit ×2,5) :

Sur la meilleure mesure disponible (A/B du 2026-08-08 : **61 req/s** local),
transposée à la production au rapport observé sur le chemin d'écriture
(local 160 → prod 409, soit ×2,5) : **~150 req/s** pour `getEventState`.

| Offre | Jauge | Besoin (Realtime coupé) | Disponible (estimé prod) | Verdict |
|---|---|---|---|---|
| Coup d'envoi / Le Club | 100 | 40 req/s | ~150 req/s | **tient** |
| Le Grand Jeu | 500 | 200 req/s | ~150 req/s | **limite** |
| La Totale | 1 000 | 400 req/s | ~150 req/s | **ne tient pas** |

**Avec Realtime connecté**, la cadence passe de 2 500 à 30 000 ms et le besoin
est divisé par douze : 1 000 joueurs ne demandent plus que **33 req/s**, ce qui
passe très largement. **Le levier n'est donc pas l'optimisation de l'endpoint —
c'est Realtime**, déjà écrit, testé, avec repli par polling, et qu'il suffit
d'activer (`EVENTS_REALTIME_ENABLED`).

Le plafond se déplace alors sur les **connexions Realtime simultanées** :
200 sur Supabase Free, 500 sur Pro. Une salle de 1 000 les dépasse encore — et
c'est là, pas dans le SQL, que se joue la faisabilité de la jauge vendue.

### Le levier existe déjà, et il est à moitié posé

Activer Realtime fait passer la cadence de 2 500 à 30 000 ms — **douze fois
moins de trafic** : 1 000 joueurs ne demandent plus que 33 req/s, ce qui passe
largement. Le code est écrit, testé, avec repli par polling ; seule la variable
`EVENTS_REALTIME_ENABLED` manque en production.

Mais le plafond se déplace alors sur les **connexions Realtime simultanées** :
200 sur Supabase Free, 500 sur Pro. Une salle de 1 000 les dépasse encore.

**Le correctif qui débloquerait réellement les grandes salles** est ailleurs, et
il est bon marché : `event_public_state` rend la MÊME réponse à tous les joueurs
d'une session, à leur score personnel près. Un cache serveur d'une seconde par
session ramènerait 400 req/s de travail base à **une requête par seconde**.
Ce n'est pas fait, et c'est le chantier à ouvrir avant de vendre une grosse
soirée.

**Restent ouverts** : le démarrage à froid (1 859 ms mesuré avant, à
re-mesurer) et le débit réel des server actions.

**Ce que cela invalide.** Les ~850 req/s du §4 ne sont pas faux, ils ne
mesurent pas la même chose : ils décrivent le service d'une page ISR par le
CDN, pas un chemin dynamique adossé à la base. Pour toute décision de capacité
sur une animation live ou une soirée à forte affluence, c'est le tableau
ci-dessus qui fait foi, pas celui du §4.

## 6. Limites et recommandations

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
