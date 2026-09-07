# Brief de refonte du site — pour Antigravity / Gemini

**Date** : 2026-09-06 · **Analyse faite sur** `main` @ `98af9c71`, **relue sur**
`ffc7cf2c` (PR #367, « Release gate ») — cette PR touche le moteur de tirage et le Ticket
d'Or, aucune surface marketing : les constats ci-dessous restent valables tels quels.
**Objectif** : agrandir le site, mettre en avant les fonctionnalités phare, garder la DA,
supprimer la roue actuelle. Sans tout refondre.

> Tous les faits ci-dessous ont été lus dans le code, pas déduits. Les chemins sont exacts.

---

## 0. Le constat qui commande tout le reste

**Il existe DEUX surfaces marketing, elles ne racontent pas le même produit, et aucune
des deux ne vend ce qui est réellement livré.**

| | Surface A | Surface B |
|---|---|---|
| Domaine | `app.lastchance.app/` | `www.lastchance.app` |
| Code | [`src/app/(public)/page.tsx`](../src/app/(public)/page.tsx) — 1102 lignes, une seule page | [`site/`](../site/) — projet Next **séparé**, 4 pages |
| DA | **« La Kermesse »** — crème/encre, Lilita One, bordures 3 px, ombres dures, décor scrollytelling | Violet/zinc, Geist, cartes plates |
| Offres affichées | **1 seule** : « Starter 29 € » + option Pronostics 9 € | **Les 5 vraies offres** (29/59/79/89/129 €) + 13 options |
| Modules mis en avant | **2 sur 14** (roue, pronostics) | ~6, listés sans hiérarchie |

Les deux `metadata.description` disent encore *« Roue de la fortune par QR code »*
([`src/app/layout.tsx:22`](../src/app/layout.tsx#L22), [`site/src/app/layout.tsx`](../site/src/app/layout.tsx)).

**Conséquence commerciale directe** : la landing sur laquelle arrive un prospect
(`app.lastchance.app`) annonce un prix unique de 29 € et une roue. Le produit facture
jusqu'à 129 €/mois et contient quatorze modules. Le visiteur ne peut pas se dire
« wouah, tout ça pour ce prix » — on ne lui montre pas le « tout ça ».

### Décision prise (2026-09-06, par le propriétaire)

**Une seule surface marketing, en DA « La Kermesse ».**

La cible est `src/app/(public)/`, étendue en plusieurs pages. `site/` est la surface qui
disparaît : elle est plus pauvre, dans une DA écartée, et duplique la grille tarifaire.

**Ordre d'exécution imposé — `site/` ne se supprime qu'EN DERNIER.**
`site/` sert aujourd'hui `www.lastchance.app` depuis un projet Vercel distinct. Le
supprimer avant que le remplacement soit en ligne coupe le domaine public. La séquence est
donc : (1) construire les pages en DA Kermesse sous `src/app/(public)/`, (2) les vérifier
en ligne, (3) faire pointer `www` vers l'application, (4) **alors seulement** retirer
`site/`, `e2e-site/`, `playwright.site.config.ts` et le projet Vercel.

L'étape (3) touche un domaine de production : elle demande une **action explicite du
propriétaire**, elle n'est pas à la main d'un agent.

---

## 1. Ce que le produit contient vraiment (inventaire vérifié)

### 1.1 Quatorze modules vendables — et ils sont DÉJÀ classés par objectif

Source canonique : [`src/platform/experiences/catalog.ts`](../src/platform/experiences/catalog.ts).
Chaque entrée porte `label`, `shortDescription` et **`objective`**. Ces textes sont écrits,
validés, et réutilisables tels quels sur le site.

**C'est l'architecture d'information de la refonte : elle existe déjà dans le code.**

| Objectif | Modules | Accroche existante (`shortDescription`) |
|---|---|---|
| **Acquérir** | Jeux instantanés | Roue, grattage et mini-jeux pour acquérir et convertir. |
| | Parrainage | Transformez vos clients en ambassadeurs avec des paliers. |
| | Vitrine | Publiez votre carte au QR code, en français et en anglais. |
| **Créer du trafic** | Chasse au QR | Reliez plusieurs lieux et faites progresser le trafic physique. |
| | Moments | Ateliers, dégustations, files d'accueil : faites vivre un moment à vos clients. |
| | Réservation | Vos horaires une fois, les créneaux se génèrent : vos clients prennent rendez-vous depuis votre Vitrine. |
| **Fidéliser** | Passeport fidélité | Récompensez les visites répétées et les habitudes durables. |
| | Calendrier | Créez un rendez-vous quotidien et une récompense d'assiduité. |
| | Duo Miroir | Deux joueurs, des choix scellés, une révélation commune. |
| | Portrait de la Bande | Un vote secret par question, révélé quand la bande y est. |
| **Animer en direct** | Événements live | Animez une salle en temps réel avec écran et téléphones. |
| | Pronostics | Faites vivre les matchs de la saison avant, pendant et après. |
| | Jackpot collectif | Fédérez les participants autour d'une jauge et d'un tirage. |
| | Quiz | Composez un parcours de questions, autonome ou animé. |

⚠️ **Piège de vocabulaire** : « **Vitrine** » est un **module produit** (la carte publique du
commerçant au QR code). Ce n'est PAS le site marketing. Ne jamais confondre les deux dans
les textes — le repo appelle le site marketing « site vitrine » et le module « Vitrine ».

### 1.2 Quinze mécaniques de jeu sous le seul module « Jeux instantanés »

Source : [`src/components/dashboard/atelier-mecaniques.ts`](../src/components/dashboard/atelier-mecaniques.ts)
(constante `MECANIQUES`, champ `famille`), miroir de la contrainte SQL `wheels_game_type_check`.

⚠️ **Le `CLAUDE.md` dit « 13 de révélation + 6 skill-gated » — c'est faux.** Le 13 est un
compte de **fichiers** (`src/components/wheel/games/*-experience.tsx`), la Roue et le Grattage
vivant un cran au-dessus. Le compte réel est **15 mécaniques : 9 de hasard + 6 de défi**.
Formule sûre pour le site : *« 15 mécaniques de jeu, dont 6 jeux d'adresse. »*

**9 jeux de hasard** — Roue 🎡 · Carte à gratter 🎟️ · Carte retournée 🃏 · Bonneteau
(3 gobelets) 🥤 · Machine à sous 🎰 · Memory 🧠 · Coffre à choisir 🎁 · Lancer de dé 🎲 ·
Tirage d'une carte 🃏

**6 jeux d'adresse** (le joueur doit *réussir* avant que le tirage s'ouvre) —
Pierre-feuille-ciseaux · Jeu de réflexe · Jauge à arrêter · Puzzle simple · Mot mystère ·
Estimation d'un nombre

**Argument de valeur non exploité** : quinze jeux différents sont inclus dans l'offre
d'entrée à 29 €. La landing n'en montre qu'un — la roue.

### 1.3 Vingt-cinq parcours réels en production

13 parcours joueur (`src/app/(player)/`) : `play`, `quiz`, `hunt`, `calendar`, `event`
(+ `screen`), `jackpot`, `lobby`, `passeport`, `pronos` (+ `tv`), `reserver` (4 variantes),
`portefeuille`, `ticket`, `v/[slug]` (Vitrine bilingue), `commande`.

12 studios de création (`src/app/studio/`) : roue, quiz, chasse, fidélité, calendrier,
cagnotte, pronostics, réservation, salon, soirée, ticket-or, progression — plus
`vitrine-studio`.

### 1.4 Ce qui est inclus dans TOUTES les offres et jamais vendu

Ces briques ne coûtent rien de plus. Elles ne sont sur aucune des deux surfaces marketing,
et ce sont pourtant les meilleures réponses à « tout ça pour ce prix ».

- **La Caisse universelle** — un seul écran, un seul scanner, **onze familles de codes**
  (roue/jeux, chasse, fidélité, jackpot, calendrier, live, parrainage, quiz, pronostics,
  invendus, Ticket d'Or). Le personnel apprend un seul geste pour tout le catalogue.
- **Missions & coffres** (méta-progression) — saisons, missions, clés, coffres, badges.
  Aucune colonne `addon_` en base : **inclus partout**.
- **Ticket d'Or** — émission d'un ticket gagnant à la main, geste de service au comptoir.
- **Découvrir** — une bibliothèque de **10 modèles de campagne** prêts à appliquer
  (visuel, jeu, textes, lots, e-mails, durée, règles), triée **par les mêmes 4 objectifs**.
  Le commerçant peut enregistrer ses propres campagnes comme modèles privés versionnés.
- **Le rapport du lundi** — bilan hebdomadaire par e-mail, semaine contre semaine.
- **Portefeuille joueur** (« Mes récompenses ») — toutes les récompenses du client,
  tous jeux confondus, sur une page sans compte et sans cookie.
- **Studio créatif + affiches + Hub QR** — QR stylés, affiches A4, feuilles de test.
- **Automatisations** — 4 scénarios d'e-mail (gain non retiré, clients inactifs, après
  retrait, anniversaire) + notifications propriétaire + webhooks sortants.
- **Newsletter, exports CSV, équipe et rôles** (owner / editor / cashier).
- **SMS** — canal disponible, facturé en **packs de crédits** (100 / 500 / 2 000).
  ⚠️ Les montants ne sont **pas dans le code** : ne rien afficher sans te les demander.

**Deux détails premium qui méritent d'être dits** : le Passeport de fidélité est
**installable sur le téléphone** (PWA + Apple Wallet / Google Wallet), et les Pronostics
couvrent **onze types d'événements au-delà du sport** (cérémonie, Eurovision, élection,
remise de prix, concours culinaire, finale d'émission, tournoi local, course, e-sport,
compétition d'entreprise, événement personnalisé).

### 1.5 Le packaging réel — 5 offres

Source : [`src/lib/plans.ts`](../src/lib/plans.ts), projeté vers le site par
`npm run site:pricing` → [`site/src/content/pricing.generated.ts`](../site/src/content/pricing.generated.ts).
`PACKAGING_VERSION = "2026-09-a"`. Essai 7 jours partout.

| Offre | Prix | Promesse (tagline exacte du code) |
|---|---|---|
| **Coup d'envoi** | 29 €/mois | Lancer une animation : le jeu qui fait revenir vos clients, en libre-service. |
| **Le Club** | 59 €/mois | Fidéliser : installer l'habitude — fidélité, rendez-vous, bouche-à-oreille. |
| **Sur Place** | 79 €/mois | Se faire lire et réserver : votre carte au QR code et votre agenda, dans un seul abonnement. |
| **Le Grand Jeu** | 89 €/mois | Animer régulièrement : soirées, compétitions, temps réel dans votre salle. |
| **La Totale** | 129 €/mois | Réunir toutes les briques : toute la plateforme, sans arbitrage entre modules. |

**Le packaging est déjà bâti sur les mêmes quatre objectifs que le catalogue.**
Coup d'envoi = Acquérir · Le Club = Fidéliser · Sur Place = Créer du trafic ·
Le Grand Jeu = Animer en direct · La Totale = tout.

⚠️ **Ce n'est PAS une échelle linéaire** : Le Club (59 €), Sur Place (79 €) et Le Grand Jeu
(89 €) sont **parallèles**, pas des paliers croissants. Un tableau comparatif à colonnes
« de moins cher à plus cher » mentirait sur l'offre. Il faut une grille **par objectif**.

Seule limite chiffrée du produit : **participants par session live** — 100 (core,
engagement, place) / 250 (live, full). Aucune autre limite (campagnes, QR, emails,
sièges) n'existe : « illimité » est tenu.

### 1.6 Treize options achetables

Récurrentes : Vitrine 20 €/mois · Moments 20 € · Réservation 20 € · Passeport des habitués
19 € · Parrainage 12 € · Duo Miroir 12 € · Portrait de la Bande 12 €.
*(Vitrine, Moments et Réservation ne se vendent PAS seules — ce sont des lignes d'un
abonnement en cours. `ADDONS_PURCHASABLE_STANDALONE = false`.)*

Achats uniques : Chasse au QR 29 €/30 j · Calendrier à surprises 29 €/31 j · Quiz express
15 €/7 j · Cagnotte collective 29 €/30 j · Saison de pronostics 39 €/compétition ·
**Soirée en jeu** 9 € (10 joueurs) / 19 € (30) / 29 € (50).

Packs SMS (`sms-100`, `sms-500`, `sms-2000`) : prix uniquement dans Stripe, **absents du
code** — ne rien afficher sans demander les montants.

### 1.7 Quatre choses à NE PAS écrire sur le site

Chacune est un écart entre ce que le produit promet et ce qu'il fait. Les deux premières
sont des risques réels, pas des nuances de style.

1. **Ne jamais promettre qu'un pass expire.** Les `activeDays`, `activationWindowDays` et
   jauges des options sont **descriptifs et non appliqués** — le commentaire de
   [`src/lib/plans.ts`](../src/lib/plans.ts) est explicite : « il n'expire pas, personne ne
   l'a encore écrit ». Aujourd'hui les add-ons sont des booléens permanents. Écrire
   « 30 jours d'usage » sur la page tarifs vend une mécanique qui n'existe pas encore.
   → Formuler au présent de ce qui est vrai, ou attendre que l'expiration soit livrée.
2. **`priceMonthly` est un prix de vitrine.** Le montant facturé vient du `price` Stripe.
   Si les deux divergent, c'est Stripe qui gagne — vérifier avant de publier une grille.
3. **Ne pas dire que les récompenses de « Missions & coffres » se cumulent ou s'échangent.**
   Clés, badges, objets et coffres sont **explicitement non monétaires** : aucun code de
   caisse, rien à encaisser.
4. **Ne pas présenter les 15 mécaniques comme 15 « modules ».** C'est **un** module
   (Jeux instantanés, socle `core`) qui en contient quinze.

---

## 2. La roue à supprimer

**Composant** : [`src/components/marketing/hero-showcase.tsx`](../src/components/marketing/hero-showcase.tsx)
— 502 lignes, roue SVG interactive 8 segments + écran de téléphone, 100 % front.

**Consommé à un seul endroit** : section `WheelDemo`,
[`src/app/(public)/page.tsx:415`](../src/app/(public)/page.tsx#L415) (ancre `#demo-roue`).

**Ce qu'il faut retirer avec elle, sinon ça casse ou ça ment :**

1. Le CTA `#demo-roue` du hero — bouton « Essayer la roue » (~ligne 330).
2. [`src/components/marketing/scroll-arrow.tsx`](../src/components/marketing/scroll-arrow.tsx)
   — se cale sur `data-wheel-anchor`, porté par la roue. Sans elle, la flèche vise le vide.
3. [`src/components/marketing/pseudo-qr.tsx`](../src/components/marketing/pseudo-qr.tsx)
   — consommé uniquement par `hero-showcase`.
4. Les textes qui promettent la roue : `<h1>` « La chance fait **revenir** vos clients »,
   CTA « **Créer ma roue** → » (hero **et** CTA final), `FEATURES[02]` « Roue 100 %
   personnalisable », `PRICING_FEATURES` « Campagnes et **roues** illimitées »,
   le ruban « ILS SCANNENT ★ ILS TOURNENT ★ … », et le H2 final « Votre **roue** peut
   tourner dès ce soir. »
5. Les deux `metadata.description` (« Roue de la fortune par QR code »).

**Par quoi la remplacer** : la roue occupait la place de la *preuve jouable*. La remplacer
par une carte vide serait une perte nette. Recommandation : un **sélecteur d'expérience**
— l'utilisateur choisit l'objectif (Acquérir / Trafic / Fidéliser / Animer) et voit
l'aperçu correspondant. Cela transforme le trou en démonstration de l'étendue, qui est
exactement le message manquant.

---

## 3. Ce qu'il faut GARDER — la DA « La Kermesse »

Définie dans [`src/app/globals.css`](../src/app/globals.css) (bloc `@theme`, lignes 26-51).
**Ne pas y toucher** : elle est calibrée en contraste, mesures documentées dans le fichier.

```
--color-k-ink    #211d16   encre        --color-k-yellow  #fcca59
--color-k-bg     #fdf6e3   crème        --color-k-pink    #f296bd
--color-k-body   #3d382f   texte        --color-k-blue    #99b7f5
--color-k-muted  #6b6459   atténué      --color-k-green   #267f53
--color-k-stripe #f3ead3   rayure       --color-k-orange  #f5793b
--color-k-orange-text #b45309  ← petits libellés sur crème/blanc UNIQUEMENT
```

Polices : **Lilita One** (`--font-display`, titres) + **Nunito 600-900**
(`--font-heading`, corps).

Vocabulaire de formes, déjà écrit en classes utilitaires (à réutiliser, pas à réinventer) :
`.k-border` (3 px) · `.k-border-thin` (2,5 px) · `.k-card` (verre fin) · `.k-card-hover`
(encre pleine au survol) · `.k-card-deep` (prune, seule surface sombre) · `.k-hard` /
`.k-hard-sm` (ombres **verticales**) · `.k-btn` (socle qui s'écrase) · `.k-halo` (halo
crème sur le décor) · `.k-glass` · `.k-stripes` · `.k-sticker` · `.k-float` · `.k-bob`.

**Trois règles de DA établies, écrites dans les commentaires du code — les respecter :**
1. Les sections sont **transparentes** ; le décor scrollytelling passe derrière.
   Pas de séparateur pleine largeur, pas d'empilement de boîtes blanches.
2. Les ombres dures sont **verticales**, jamais diagonales.
3. La couleur vit dans la **pastille**, pas dans le texte des sur-titres — mesuré :
   l'orange en texte tombe à 1,67:1 sur le décor.

Décor : [`src/components/marketing/scroll-panorama-background.tsx`](../src/components/marketing/scroll-panorama-background.tsx)
+ `public/panorama/` (p1080/p1920/p2560.webp, **suivis par git**). Il publie
`--backdrop-accent` au fil du scroll : le ruban et les sur-titres s'y accordent.

---

## 4. Plan de refonte recommandé

### Principe : ne pas allonger la page unique — la faire éclater en pages par objectif

La page actuelle fait déjà 1102 lignes pour 2 modules. Y empiler 14 modules donnerait
exactement le « brouillon » à éviter. L'axe des **quatre objectifs** existe déjà dans le
code : c'est lui qui doit porter la navigation.

**Trois preuves que c'est le bon axe, et pas une invention de ce brief :** le catalogue
porte un champ `objective` sur chaque module ; les cinq offres sont bâties sur ces mêmes
objectifs (leurs taglines commencent par « Lancer / Fidéliser / Se faire lire / Animer ») ;
et la page « Découvrir » du dashboard trie déjà ses modèles de campagne par
Acquérir / Fidéliser / Animer en direct / Créer du trafic. Le produit se pense ainsi en
interne — le site est le seul endroit où ce tri n'apparaît pas.

**Arborescence proposée :**

```
/                     Accueil — promesse + les 4 objectifs + preuve + tarifs en aperçu
/attirer              Acquérir      → Jeux instantanés, Parrainage, Vitrine
/faire-venir          Créer du trafic → Chasse au QR, Moments, Réservation
/fideliser            Fidéliser     → Passeport, Calendrier, Duo Miroir, Portrait de la Bande
/animer               Animer en direct → Événements live, Pronostics, Jackpot, Quiz
/tarifs               Les 5 offres par objectif + les 13 options
/faq                  (existe côté site/, à porter en DA Kermesse)
```

### Accueil — ce qui doit capter en 5 secondes

1. **Hero** : promesse qui ne parle plus de roue mais de la plateforme.
   Garder les 4 pastilles de preuve (`HERO_CHIPS` : prêt en 10 min · sans compte client ·
   conforme RGPD · sans engagement) — elles fonctionnent.
2. **Le compteur d'étendue, tout de suite** — c'est le « wouah » qui manque.
   Quatre nombres vérifiés : **14 modules · 15 jeux · 25 parcours · dès 29 €/mois**.
   Et la phrase qui les relie : *une seule caisse valide les gains des onze familles.*
3. **Les quatre objectifs en quatre cartes** (`.k-card`, une couleur par objectif :
   orange/jaune/rose/bleu). Chaque carte → sa page. C'est le tri qui évite le brouillon.
4. **La preuve jouable** (remplace la roue) : sélecteur d'expérience par objectif.
5. **Espace commerçant** : garder `DashboardMockup` — il fonctionne, il est bon.
6. **Le jeu honnête** : garder `HonestGame` tel quel. C'est le seul argument frontal
   contre la concurrence, et le seul panneau sombre de la page. Ne pas le diluer.
7. **Tarifs en aperçu** : les 5 offres, pas une seule. Lien vers `/tarifs`.
8. **FAQ + CTA final.**

### La grille tarifaire — la contrainte à ne pas rater

Les 5 offres ne sont pas des paliers. Rendu recommandé : **une colonne par objectif**,
chaque colonne portant son offre et ses modules, avec « La Totale » présentée à part
comme la réunion des trois. Le prix par module rapporté à l'offre est l'argument
« tout ça pour ce prix » : *Le Grand Jeu, 89 €/mois = 7 modules, soit ~13 € le module.*

Le tarif ne doit **jamais** être retapé à la main : il est généré. Si le packaging change,
lancer `npm run site:pricing` — un test échoue si le fichier committé diverge
([`src/lib/site-pricing.test.ts`](../src/lib/site-pricing.test.ts)).

---

## 5. Contraintes techniques — ce qui fera rougir la CI

| Garde | Fichier | Ce qu'elle impose |
|---|---|---|
| **axe serious/critical** sur `/` | [`e2e/a11y.spec.ts:18`](../e2e/a11y.spec.ts#L18) | Zéro violation. Contraste, noms accessibles, hiérarchie de titres. |
| Smoke `site/` | [`e2e-site/smoke.spec.ts:20`](../e2e-site/smoke.spec.ts#L20) | Attend un `<h1>` correspondant à `/roue de la fortune/i` et les libellés « Essayer gratuitement » / « Voir les tarifs ». **Ces assertions casseront** si on retire la roue côté `site/` — les mettre à jour dans le même lot. |
| En-têtes de sécurité + CSP | `e2e-site/smoke.spec.ts:146,183` | Aucune ressource externe non déclarée. Pas de CDN ajouté sans toucher la CSP. |
| Tarifs générés | `src/lib/site-pricing.test.ts` | `pricing.generated.ts` doit rester le reflet de `src/lib/plans.ts`. |
| Décor | `src/lib/backdrop-panorama.test.ts` | — |
| Budget `CLAUDE.md` | `src/lib/claude-md-budget.test.ts` | Ne pas empiler dans `CLAUDE.md`. |

**Vérifications à lancer** (depuis `~/workspaces/lastchance` en WSL, `bash -l`) :

```bash
npm run typecheck && npm run lint
npx vitest run site-pricing
npx playwright test e2e/a11y.spec.ts
cd site && npm run typecheck && npm run build
```

**Deux projets Next distincts** : `site/` a son propre `package.json`, ses
`node_modules` et son alias `@/*` → `site/src`. Ne jamais importer l'app depuis `site/`.

---

## 6. Code mort — RÉGLÉ le 2026-09-06

`.gitignore` ne nommait pas seulement de l'outillage : il ignorait **cinq fichiers de code
source**, un par un. Ignorer du code par son nom ne le met pas de côté, ça le rend
invisible — les cinq n'étaient importés par personne.

**Supprimés** (sauvegarde hors dépôt conservée) :

| Fichier | Ce que c'était |
|---|---|
| `site/src/components/sections/game-homepage.tsx` | 283 lignes : une **troisième** direction artistique complète (bambou/nuages/grotte). Aucune de ses ~40 classes `game-*` n'existait dans un CSS — elle se serait rendue **sans style**. |
| `site/src/components/sections/scroll-backdrop.tsx` | Décor canvas 97 images, non importé. |
| `site/src/content/backdrop.ts` | Ses données. |
| `src/components/marketing/scroll-video-background.tsx` | 23 Ko. Même défaut côté app : un commentaire voisin le disait encore « la version vivante de `/` », alors que la page importe `ScrollPanoramaBackground`. |
| `src/lib/backdrop-frames.ts` | Ses données, importées par le seul fichier ci-dessus. |

Les cinq lignes correspondantes ont été retirées de `.gitignore`, avec la raison écrite sur
place. Ce qui reste ignoré ne vise plus que de l'outillage et des sorties binaires.

**Typecheck vert sur les deux arbres après suppression** (`site/` et racine).

**Le décor vivant est intact** : `src/components/marketing/scroll-panorama-background.tsx`
+ `public/panorama/` (1,2 Mo), tous deux **suivis par git**. Ne pas y toucher.

### Ce qui reste sur le disque et n'a pas été supprimé

**80 Mo d'images orphelines**, gitignorées donc jamais déployées : `public/backdrop/`
(74 Mo) et `site/public/backdrop/` (6,1 Mo). Elles alimentaient les fichiers ci-dessus.
Elles ne sont **pas régénérables** — la vidéo source (`Input/Vidéo Site.mp4`) n'est plus
dans `Input/`. Comme elles ne coûtent rien au dépôt et qu'on ne peut pas les recréer,
elles sont laissées en place ; à supprimer sur ton ordre seulement.
Le générateur `site/scripts/build-backdrop-frames.mjs` est orphelin pour la même raison.

### Un actif prêt à brancher

`site/src/lib/roi.ts` — simulateur de ROI complet, hypothèses centralisées et calibrées,
**consommé par aucun composant**. Il importe déjà le prix d'entrée depuis le fichier
généré (jamais en dur). Deux réserves avant de l'afficher : son champ
`currentVisitsPerMonth` est déclaré mais **jamais utilisé** dans `computeRoi`, et son
`roiMultiple` est un rapport *gain net / dépense* — « ×3,2 » ne veut pas dire ×3,2 de
chiffre d'affaires. À porter sur la nouvelle surface, c'est un argument commercial fort.

---

## 7. Résumé en une page pour l'exécutant

**Garder** : la DA Kermesse (tokens `k-*`, Lilita One + Nunito, ombres verticales, décor
scrollytelling), `DashboardMockup`, `HonestGame`, les 4 pastilles de preuve du hero.

**Supprimer** : `hero-showcase.tsx` (roue), `scroll-arrow.tsx`, `pseudo-qr.tsx`, l'ancre
`#demo-roue`, et **tous** les textes qui promettent une roue (h1, 2 CTA, ruban, 2 features,
h2 final, 2 metadata).

**Ajouter** : l'axe des 4 objectifs (déjà dans `catalog.ts`), 4 pages produit, les 14 modules
avec leurs `shortDescription` existantes, les 5 offres réelles, le compteur d'étendue
(14 modules · 15 jeux · 25 parcours · dès 29 €), la Caisse universelle et les briques
incluses partout (§1.4), une preuve jouable en remplacement de la roue.

**Ne pas** : retaper un prix à la main · confondre le module « Vitrine » et le site vitrine ·
présenter les 5 offres comme des paliers croissants · empiler les 14 modules sur la page
d'accueil · toucher aux tokens de contraste · **promettre qu'un pass expire** · dire
« 13 jeux » · présenter les clés et coffres comme monnayables.

**Trancher d'abord** : une surface marketing ou deux ? Et que faire des trois fichiers
gitignorés ?

---

## 8. État de l'arbre au moment de la remise

**La refonte n'est pas commencée.** La suppression de la roue et le nouveau site sont
décrits ici, pas exécutés — c'est le travail confié à Antigravity.

Ce qui **a** été fait dans cette session, en plus de ce document :

- suppression des **cinq fichiers source morts** et nettoyage de `.gitignore` (§6) ;
- correction du compte des mécaniques (**15**, pas 13) dans `CLAUDE.md` et
  `docs/architecture.md` ;
- ouverture d'une entrée `docs/bugs.md` sur les **durées d'add-on affichées mais non
  appliquées** (§1.7, point 1).

Quatre fichiers modifiés, non commités : `.gitignore`, `CLAUDE.md`,
`docs/architecture.md`, `docs/bugs.md`. Typecheck vert sur les deux arbres.

Le chantier « Release gate » (PR #367) a été commité et fusionné pendant l'analyse : le
moteur de tirage, le nonce de spin et le Ticket d'Or sont désormais sur `main`. Plus rien
n'est en suspens de ce côté — Antigravity peut travailler sans risque de collision.
