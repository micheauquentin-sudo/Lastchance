# Transmission Codex → Claude Code

> Document local de référence partagé. Claude Code le lit avant toute mission
> demandée par l'utilisateur et peut y ajouter son avancement réel selon la
> règle ci-dessous. Codex le met à jour après chaque audit, décision, lot validé
> ou constat d'écart.

## Règle de travail

- Codex pilote le développement : il conduit les audits, définit les priorités,
  rédige les propositions et contrôle les résultats. Pour un audit complet, il
  mobilise ses agents Codex pertinents sur produit, architecture, qualité,
  performance et sécurité ; pour un audit ciblé, il choisit les agents dont le
  regard apporte une preuve utile.
- Chaque audit distingue les faits vérifiés des hypothèses et couvre, selon le
  périmètre, la valeur métier, l'expérience et l'accessibilité, la fiabilité et
  la performance, ainsi que la sécurité, la confidentialité et le multi-tenant.
- Chaque proposition Codex doit être justifiée par un constat ou une hypothèse
  vérifiable, le bénéfice concret pour le commerçant ou le joueur, le risque,
  le coût de mise en œuvre, les dépendances, une métrique de succès et une
  priorité. Les idées décoratives ou non reliées à une friction, un risque, un
  coût ou un résultat mesurable ne sont pas retenues ; les pistes écartées sont
  signalées avec leur raison.
- Après chaque audit, demande d'amélioration, décision ou proposition, Codex
  met à jour ce document : état réel, éléments faits, éléments non faits,
  risques et prochaine décision. Ce document est le journal partagé unique.
- Codex ne lance plus Claude Code, ne lit plus ses sessions et ne modifie pas
  ses réglages.
- Claude intervient seulement à la demande directe de l'utilisateur dans VS
  Code. Avant d'agir, il lit ce document, `CLAUDE.md`, les états
  `.claude/state/`, puis vérifie `git status --short`.
- Claude choisit et coordonne lui-même ses agents selon ses règles existantes.
  Codex ne lui impose ni agent, ni modèle, ni séquencement d'exécution.
- **Autorisation utilisateur (2026-08-06) :** Claude peut mettre à jour ce
  document après chaque avancée significative d'un lot (début confirmé,
  modification prête à relire, validation, blocage ou clôture). Il ajoute une
  entrée datée dans **Journal d'avancement Claude**, en tête de cette section,
  sans supprimer, réécrire ni déplacer une décision Codex, un périmètre validé
  ou une entrée historique.
- Chaque entrée Claude contient uniquement : lot et objectif, branche/commit
  s'ils existent, état (**en cours**, **à relire**, **bloqué** ou **terminé**),
  faits et fichiers réellement touchés, validations réellement exécutées et
  leurs résultats, risque/blocage, puis prochaine action. Une validation non
  exécutée reste explicitement « non exécutée » ; aucun secret, donnée
  personnelle, lien de session ou résultat inventé n'y est ajouté.
- Claude exécute le besoin demandé par l'utilisateur en tenant compte de ce
  document. Son droit d'ajout ne l'autorise pas à modifier les décisions produit
  ni à approuver seul un commit, push, fusion, déploiement, migration distante
  ou action Stripe. Il termine aussi par un résumé court pour l'utilisateur.
- Codex compare ce document au dépôt lors de sa prochaine revue. Toute ligne
  prouvée comme faite passe dans **Terminé** ; seules les lignes non réalisées
  restent dans **À exécuter** ou **Bloqué**.

## Journal d'avancement Claude

> Claude ajoute ses entrées les plus récentes juste sous cette note, sans effacer
> les précédentes. Ce journal décrit l'exécution ; les décisions et priorités
> Codex restent dans les sections qui suivent.

### 2026-08-06 — Lot A : la classe « champ non rendu » fermée au schéma — **terminé**

- **Lot et objectif** : fermer la classe « `FormData.get` rend `null` pour un
  champ non rendu » — les deux modes de panne, pas seulement le bruyant — et la
  verrouiller mécaniquement. Préalable aux lots §9.3/§9.4/§9.5 qui ajoutent des
  formulaires.
- **Branche/commits** : `chantier/formulaires-null-classe`, commits `db4e54e`,
  `e255297`, `f5fbe55`, `61281c9`, `f04e9bf`, docs `323e7c4`.
- **Faits et fichiers** : mesure réelle de la classe : 26 violations (3
  bruyantes, 23 silencieuses — `z.coerce.number()` convertit `null` en 0 ; ne
  frappait que les bornes basses à 0, `min(1)` refusait `null` par accident).
  Les plus coûteuses : trois cooldowns anti-rejeu (chasse, fidélité, jackpot)
  désarmables par un champ non rendu, et le poids d'un lot mis à 0 (jamais
  tiré). Livré : `src/lib/validations/champ-formulaire.ts` (7 primitives),
  62 déclarations converties sur 12 modules, 98 `??` d'appelant supprimés (5
  survivent, commentés), garde comportementale
  `champ-formulaire-coverage.test.ts` (2 invariants sur 300+ champs de 24
  modules ; invariant « un requis refuse null » sans aucune exclusion ;
  37 exclusions JSON-only justifiées), 45 tests, contrôles négatifs joués et
  restaurés. Docs : roadmap V1.41, ADR-084, bugs.md requalifié (l'entrée
  « CLOS » du 2026-08-05 comptait les rejets, pas les conversions silencieuses).
- **Validations exécutées** : typecheck 0 ; lint 0 ; casts:check 0 ;
  migrations:check ok (aucune migration au lot) ; sql:check ok ; Vitest
  **197 fichiers / 3303 tests** verts (+45) ; build vert. pgTAP **non exécuté**
  (aucun SQL touché) ; E2E locale **non exécutée** (déléguée à la CI).
- **Risque/blocage** : résiduel assumé et documenté — un champ rendu mais vidé
  (`""`) vaut toujours 0 par coercition sur les entiers requis (comportement
  d'origine, hors classe).
- **Prochaine action** : PR puis fusion — **demandées explicitement par
  l'utilisateur ce jour** (« fusionne tout ce que tu as à fusionner ») — puis
  lot §9.3 (Dashboard guidé, Carte de l'Aventure, Relancer une formule).

_Aucune entrée créée par Codex : Claude renseigne ce journal à sa prochaine
avancée significative._

## Dernière demande utilisateur

Codex pilote le développement de LastChance. Les audits doivent être précis et
transverses ; les propositions doivent améliorer concrètement l'expérience des
commerçants et des joueurs, la performance ou la sécurité. Chaque demande,
constat, proposition et décision Codex doit être consigné ici.

## État vérifié par Codex — 2026-08-04 (à lire avant un nouveau lot)

**Constat de dépôt, en lecture seule :** le clone consulté est sur `main`, sans
modification locale, à `0b41219` (« P0 lot 2 »). Aucun chantier en cours n'est
visible dans l'arbre Git. Ceci ne vaut pas observation d'une session Claude :
Codex ne les lit pas. Les preuves de tests ci-dessous sont celles consignées
dans les commits intégrés ; elles restent à requalifier localement avant une
nouvelle livraison ou une mutation distante.

| Sujet | État réel | Ce que cela apporte | Limite restante |
| --- | --- | --- | --- |
| Catalogue et site public | **Terminé dans `e93963f` / PR #98.** Les quatre offres et les huit add-ons dérivent du catalogue racine ; le site ne recopie plus prix, droits ni limites. | Le prospect lit la même offre que le dashboard. | Catalogue descriptif seulement : aucun produit, Price ID, checkout ou droit Stripe n'a été créé. Le site n'a pas de runner de tests propre ; ses typecheck/lint/build doivent être exécutés séparément. |
| P0 lot 1 : publication payante | **Terminé dans `623e1aa` / PR #99.** Les transitions de publication passent par des RPC SQL gardées : rôle, droit du module, droit effectif et audit. | Un éditeur ne peut plus activer un module par appel PostgREST direct lorsque le droit est absent ou inactif. | Le retour à un brouillon reste volontairement permis ; ne pas le confondre avec une publication. |
| P0 lot 2 : droits datés et add-ons autonomes | **Terminé dans `0b41219` / PR #102.** Un octroi porte ses fenêtres ; SQL et TypeScript restent en parité ; le back-office peut accorder, lire et révoquer les octrois non Stripe. | Une Chasse, un Quiz ou une Soirée achetée seule peut ouvrir son seul module, puis cesser de façon sûre à l'expiration. | Aucun flux de paiement/webhook ne crée encore ces octrois. Les montants et durées du catalogue ne sont pas injectés en base. |

### Prochain lot précis proposé à Claude — P0.3 : rendre le dashboard cohérent avec le droit effectif

**Hypothèse à vérifier d'abord :** aucun `canExplore` ni `canEditDraft` n'est
présent dans `src/` ou `site/`. Le seul `canPublish` trouvé concerne la
publication d'une *version de blueprint* dans
`experience-blueprint-state.ts`, pas le droit effectif d'une expérience. La
règle « un brouillon non payé par organisation et par module » n'a pas été
retrouvée. Les lots P0.1/P0.2 ferment la porte de publication en base ; ils ne
suffisent donc pas à démontrer toute l'expérience de découverte et de brouillon
du dashboard.

- **Bénéfice commerçant :** il peut préparer une animation sans payer ni se
  tromper sur ce qui est publiable ; un éditeur sait quand demander au
  propriétaire au lieu de tomber sur un échec technique.
- **Priorité :** P0, avant le QR universel. **Coût :** moyen (lecture droits,
  règles de brouillon, surfaces dashboard et tests). **Risque :** élevé si la
  séparation est seulement visuelle : les actions, routes et RPC doivent rester
  cohérentes avec les gardes SQL déjà livrées.
- **Périmètre autorisable après validation utilisateur :** cartographier les
  neuf modules et leurs actions, définir un type/contrat unique pour les trois
  capacités, appliquer la limite de brouillon, rendre le message propriétaire/
  éditeur, puis tester les parcours sans droit, avec droit et à expiration.
  Aucun checkout, produit Stripe, Price ID, appel réel Stripe, migration
  distante, commit, push ou déploiement ne fait partie de ce lot sans accord
  distinct.
- **Preuves minimales :** migrations et pgTAP si le schéma évolue ; tests
  TypeScript/actions pour les trois capacités ; revue de toutes les routes/RPC
  de publication ; typecheck, lint, build racine et `npm --prefix site run
  typecheck`, `lint`, `build` si le site est touché. Préférer WSL/Docker pour
  l'équivalent local avant CI.

**Décision attendue :** l'utilisateur confirme P0.3 ou choisit un autre lot.
Le QR universel sur une expérience pilote ne démarre qu'après ce verdict P0.

## A LIRE EN PREMIER — decisions produit utilisateur (2026-08-04)

**Ce bloc est la source de verite produit pour Claude.** Il remplace les noms
historiques `Core / Engagement / Live & Events / Full Platform` encore presents
plus bas. Ne creer aucun produit Stripe, Price ID, checkout, abonnement ou
migration distante a partir des montants ci-dessous : ce sont les tarifs et
durees de reference produit, a revalider commercialement avant mise en vente.

### 1. Offres mensuelles — noms confirmes

| Offre | Promesse affichee |
| --- | --- |
| **Coup d'envoi** | lancer une animation |
| **Le Club** | fideliser |
| **Le Grand Jeu** | animer regulierement |
| **La Totale** | reunir toutes les briques |

« La Totale » remplace definitivement « La Grande Aventure ». Les objectifs
restent des sous-titres : ils ne doivent pas etre deduits du seul nom de l'offre.

### 2. Add-ons — tous independants d'un abonnement

**Decision confirmee :** tout add-on peut etre achete seul. Il embarque les
briques communes strictement necessaires (organisation, QR/publication, lots,
caisse et gardes), sans deverrouiller les autres modules. Un client peut cumuler
plusieurs droits actifs, chacun borne a son module et, pour un pass, a sa
ressource propre.

| Add-on | Prix/duree de reference | Regle confirmee |
| --- | --- | --- |
| Passeport des habitues | 19 EUR/mois | recurrent, sans engagement, actif jusqu'a la fin de la periode payee |
| Bouche-a-oreille / Parrainage | 12 EUR/mois | recurrent, sans engagement, actif jusqu'a la fin de la periode payee |
| Chasse au tresor | 29 EUR / 30 jours | achat unique, activable dans les 90 jours |
| Calendrier a surprises | 29 EUR / une campagne jusqu'a 31 jours | achat unique, activable dans les 90 jours |
| Quiz express | 15 EUR / 7 jours | achat unique, activable dans les 90 jours |
| Cagnotte collective | 29 EUR / 30 jours | achat unique, activable dans les 90 jours |
| Saison de pronostics | 39 EUR / une competition | voir regle longue ci-dessous |
| Soiree en jeu | 10 joueurs : 9 EUR ; 30 : 19 EUR ; 50 : 29 EUR | voir regle de jauge ci-dessous |

Les mecaniques continues sont mensuelles ; les mecaniques de campagne ou
d'evenement sont des achats uniques a duree fixe. Aucun essai add-on : l'essai,
si conserve, reste celui de l'offre principale. Les credits SMS restent un achat
distinct sans expiration seulement quand Brevo/STOP/AF2M sont prets.

#### Regles particulieres validees

- **Saison de pronostics :** une seule competition identifiee et un seul
  `contest_id`, de l'activation jusqu'a sept jours apres la finale ou la cloture
  manuelle, avec plafond dur de douze mois. Ligue 1 et Ligue des champions ne
  doivent jamais etre coupees artificiellement a 90 jours. Les donnees restent
  consultables/exportables 30 jours apres ; le droit de jouer ne continue pas.
- **Soiree en jeu :** pass autonome incluant temporairement Coup d'envoi,
  Evenements et Quiz. Jauge choisie avant paiement, enregistree et jamais
  ajustee ou facturee retroactivement. Sept jours de preparation puis 24 heures
  de jeu, activation dans les 30 jours. Ne pas vendre de jauge superieure avant
  un benchmark de capacite live concluant.
- A l'expiration d'un pass, la ressource est mise en pause de facon sure ; les
  donnees et exports restent lisibles. Ne jamais prolonger silencieusement.

### 3. Dashboard ouvert, publication strictement payante

- Tous les neuf modules sont visibles avec leur cas d'usage, modele, tarif et
  etat d'acces. Un client peut preparer **un brouillon non paye par organisation
  et par module**, y compris depuis un blueprint.
- Le dashboard donne acces a tout pour decouvrir ; seule la **publication** est
  verrouillee au droit effectivement paye par l'offre ou l'add-on exact.
- Aucun QR, URL publique, ecran de salle, participation, caisse, lot, tirage,
  gain, remise ou campagne active ne peut sortir d'un brouillon non couvert.
- Un proprietaire peut acheter ; un editeur voit le catalogue mais recoit
  « Demander au proprietaire », jamais un controle Stripe.
- Apres webhook de paiement, le brouillon redevient **pret a publier**, sans
  ressaisie ; publier reste un clic explicite, jamais une exposition automatique.
- Separer et revalider partout `canExplore`, `canEditDraft` et `canPublish`.
  `comp_access` n'est pas un entitlement a tous les jeux ni un droit live.

### 4. QR universel — decision confirmee

Chaque jeu, quiz et experience joueur publiable doit proposer **un QR et un
lien**. Le lien reste compatible, mais n'est jamais l'unique entree. QR/lien ne
confere aucun droit, ne contient aucun secret et ne rend pas un brouillon,
module suspendu ou impaye jouable. Priorite : droits effectifs P0, puis QR.

### 5. Dashboard simple et ludique — decisions confirmees

- Creation guidee pas a pas pour chaque experience, avec informations-bulles et
  explications simples.
- **Carte de l'Aventure** : idee → brouillon → repetition → en cours → cloturee,
  avec fanions et tampons ; elle rend la progression lisible sans remplacer les
  vrais boutons.
- **Relancer une formule** : repartir d'une animation reussie vers un brouillon
  propre pour Noel, soldes, match ou anniversaire.
- **Tableau d'equipe** : rendre visuellement les actions attribuees au
  proprietaire, a l'editeur ou a la caisse.
- **Centre d'animation** : une vue des brouillons, QR a tester, jeux en cours,
  stocks faibles, gains a remettre et taches d'equipe.

### 6. IA — perimetre confirme

Assistant de creation uniquement : aide au choix et trois idees editables.
Sortie structuree cote serveur, sans PII joueur inutile, sans publication,
paiement ou action automatique. L'IA propose ; le commercant choisit et valide.

### 7. Passeport — continuite joueur confirmee

- Apres un jeu, proposer de creer ou continuer un Passeport, sans forcer la
  creation d'un compte.
- Un lien partage cree/continue le Passeport mais **n'ajoute jamais de tampon**.
- Un QR officiel marchand eligible ou un achat/caisse valide ajoute un tampon,
  de facon idempotente. Un QR transferable prouve le support officiel, pas la
  presence physique.
- Livraison/e-commerce : une carte/QR/code unique par commande cree/continue le
  Passeport apres confirmation et ajoute un tampon une seule fois. Code generique
  = zero tampon. L'integration API Uber Eats/Deliveroo reste future et non
  approuvee ; ne pas la commencer.

### 8. Pistes a ne pas demarrer sans nouvelle validation

Le jeu de deduction sociale inspire du loup-garou (« La Nuit des Masques »),
integrations caisse, API Uber/Deliveroo, Passeport des decouvertes, Bingo de
quartier, Kit de lancement, prochaine meilleure action, Player Hub complet,
Calendrier d'occasions et multi-etablissement restent des pistes a arbitrer,
pas des lots autorises.

### 9. Ordre d'execution imperatif

1. P0 : droit effectif unique, gardes SQL/actions/routes/RPC et transitions
   publiques impossibles sans droit.
2. QR universel sur une experience pilote.
3. Dashboard guide, Carte de l'Aventure et Relancer une formule.
4. Passeport post-jeu et QR de commande unique.
5. IA MVP, puis les pistes non validees seulement sur nouvelle demande.

## Registre Codex

| Date | Type | Décision / proposition | État |
| --- | --- | --- | --- |
| 2026-07-28 | Gouvernance | Audits complets menés avec les agents Codex pertinents ; propositions filtrées par impact client, preuve, risque et coût. | Actif |

## Archive — dernier constat Codex du 2026-07-28

- Aucun chantier Claude actif.
- Le lot « Packaging et prix » est déclaré terminé par Claude, mais reste à
  relire et valider par Codex avant toute publication.
- L'arbre de travail contient des modifications non publiées de plusieurs lots
  (observabilité des workers, instrumentation des cron, Sentry/CSP et
  packaging). Elles sont à préserver et ne doivent pas être mélangées à un
  commit sans périmètre explicitement confirmé.
- Aucun commit, push, déploiement, migration distante ni création Stripe n'est
  autorisé par ce document.

## Livraison Codex — 2026-08-02 : P0 tests d'idempotence Stripe

- Les scénarios 400/409 de `ensureStripeCustomer` simulent désormais la course
  réelle : lecture initiale vide, erreur idempotente de `customers.create`, puis
  relecture de l'association gagnante. Chaque scénario vérifie que Stripe a été
  appelé une fois ; le précédent montage court-circuitait ce chemin.
- Périmètre : `src/lib/stripe.test.ts` seulement. Aucun code de production,
  appel Stripe réel, migration, secret ou configuration externe.
- Preuves : revue QA indépendante, `npm test -- src/lib/stripe.test.ts` (57
  tests verts), `npm run typecheck`, `npm run lint` et `git diff --check`
  verts.

## Terminé — à préserver

- Catalogue versionné de quatre offres : Core 29 €, Engagement 59 €, Live &
  Events 89 €, Full Platform 129 €.
- Accès aux modules et messages d'upgrade alignés sur ce catalogue dans le
  dashboard.
- Paiement sécurisé par identifiants Stripe d'environnement : aucune somme de
  vitrine n'est facturable directement.
- Claude a déclaré : tests unitaires, typecheck, lint, build et contrôles de
  migrations verts. Ces preuves devront être revérifiées avant publication.

## Archive — cahier détaillé des six blocs du 2026-07-28

> Cet ancien cahier est conservé pour traçabilité. Les blocs 1 et 2 ont été
> dépassés par les lots intégrés ci-dessus ; il ne définit plus la prochaine
> action. Le P0.3 ci-dessus est la seule proposition active de Codex.

### 1. Validation et consolidation des lots locaux

**Objectif :** relire les changements non publiés (workers, cron, Sentry, CSP
et packaging), confirmer leurs preuves et séparer un périmètre publiable.

**Limites :** préserver les modifications existantes ; pas de commit, push,
déploiement, migration distante ou changement Stripe.

**Preuves :** `git diff --check`, tests adaptés, typecheck, lint, build, puis
liste précise des écarts et risques résiduels.

### 2. Site public cohérent avec le packaging

**Objectif :** remplacer les anciennes offres « Starter », « Pronostics
+9 €/mois » et « Pass Compétition 49 € » par Core / Engagement / Live & Events
/ Full Platform.

**Limites :** réutiliser `src/lib/plans.ts` ; ne pas dupliquer prix, droits ou
limites ; pas de produit Stripe, Price ID, checkout ou déploiement ; conserver
la demande de contact si Stripe n'est pas configuré.

**Preuves :** tests ciblés, typecheck, lint, build et écarts restants.

### 3. Boucle de preuve de valeur J7 / J14 / J30

**Objectif :** montrer au commerçant activation, participation, rétention et
résultat commercial observable après 7, 14 et 30 jours.

**Limites :** événements mesurables avant les messages ; segmentation,
opt-in, désinscription, fuseau horaire et consentement ; aucun envoi réel sans
configuration et accord séparés.

**Preuves :** règles de calcul documentées, tests des segments et cas sans
donnée, démonstration ou E2E ciblé.

### 4. Player Hub transversal sans compte obligatoire

**Objectif :** donner au joueur une continuité entre expériences : historique
utile, récompenses et prochaines actions, sans compte imposé.

**Limites :** identité légère et révocable, isolation stricte par organisation,
aucune donnée personnelle inutile, compatibilité démontrée avec les parcours
publics existants.

**Preuves :** scénario nouveau joueur/joueur récurrent, contrôles multi-tenant
et RLS si la base évolue, tests de parcours et revue sécurité.

### 5. Simulateur ROI et démo interactive

**Objectif :** faire comprendre l'offre à un prospect et estimer un bénéfice
plausible avant contact.

**Limites :** hypothèses explicites, résultats présentés comme estimations,
aucun chiffre inventé ni promesse de revenu, sans compte ni appel Stripe.

**Preuves :** calculs testés, cas limites, accessibilité clavier/mobile et
mesure analytique non intrusive.

### 6. Marketing verticalisé et améliorations techniques structurantes

**Objectif :** créer des parcours par secteur sans dupliquer le code, tout en
traitant les risques techniques avant l'élargissement de l'offre.

**Limites :** composants et données partagés ; pas de copier-coller de pages ;
prioriser workers, routes publiques, webhooks, sécurité Stripe et performance ;
toute mutation distante reste soumise à autorisation séparée.

**Preuves :** architecture de contenu réutilisable, tests de rendu et liens,
contrôles de sécurité, validation Docker/WSL et rapport des risques ouverts.

## Bloqué / décision utilisateur nécessaire

- Création des produits et prix Stripe, et renseignement des
  `STRIPE_PRICE_ID_CORE`, `STRIPE_PRICE_ID_ENGAGEMENT`,
  `STRIPE_PRICE_ID_LIVE`, `STRIPE_PRICE_ID_FULL` : nécessite une autorisation
  explicite et les décisions commerciales finales.
- Commit, push, fusion, migration distante et déploiement : nécessitent une
  autorisation explicite distincte.

## Préparations propriétaire — sans nouveau chantier de code

- Confirmer le packaging commercial final : prix, période d'essai, TVA,
  politique de changement d'offre et marché de lancement. Cette décision est
  nécessaire avant de créer les produits et prix Stripe.
- Préparer l'identité légale et opérationnelle : raison sociale, adresse,
  contact support, domaine d'envoi et personne responsable des données. Ne pas
  inventer ces informations dans le produit.
- Définir une première cohorte bêta et son objectif mesurable : type de
  commerce, nombre de commerces, durée, activation visée et signal de valeur.
- Valider les indicateurs de réussite J7/J14/J30 avec les futurs commerces :
  ils doivent correspondre à leur réalité métier, pas seulement à des métriques
  techniques.
- Préparer les accès administratifs nécessaires uniquement quand une mise en
  ligne sera décidée : Stripe, domaine/email, Vercel, Supabase et analytics.
  Aucun accès, secret ou changement distant n'est demandé à ce stade.
