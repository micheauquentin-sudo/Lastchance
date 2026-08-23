# LastChance — arbitrages actifs

> **À lire avant toute intervention.** Ce fichier ne contient que ce qui reste
> à faire après les arbitrages utilisateur. Il n'est pas un journal : l'historique
> vit dans `docs/journal.md`, les décisions closes dans `docs/decisions.md`, les
> défauts ouverts dans `docs/bugs.md` et l'état des livraisons dans
> `docs/roadmap.md` / `docs/chantier-reserver-vitrine.md`.
> Le cadrage d'origine — le *pourquoi* du produit — est dans
> `docs/lastchance-reserver.md` ; **pour ce qui reste à construire, c'est ce
> fichier qui fait foi.**

## En cours

**Branche `chantier/salons-jeux-de-base`, non commitée** (constat du 2026-08-22) :
`supabase/migrations/20261022120000_salons_sans_vitrine.sql`,
`src/app/dashboard/salons/`, et des modifications de `src/lib/plans.ts`,
`src/lib/stripe.ts`, `src/lib/release.ts`, `src/lib/lobby-context.ts`,
`src/components/dashboard/nav.tsx`. Ce travail appartient à l'utilisateur :
ne pas l'écraser, ne pas l'inclure dans un commit.

**Ouvert côté offre, hors lots ci-dessous :** Vitrine (+20 €) et Réserver
(+30 €) s'ajoutent désormais comme lignes de l'abonnement existant
(`subscriptions.update`), jamais comme second abonnement. Leur vente effective
dépend encore des Price IDs Stripe configurés par environnement ; ne pas les
annoncer vendables sans cette vérification.

## Back-office — audit du 2026-08-23, livré

**État :** livré · projection Stripe locale · migration `20261030120000`

**Terrain :** `src/app/admin/(protected)/merchants/`,
`src/app/admin/(protected)/stripe/`, `src/lib/admin/data.ts`,
`src/app/api/stripe/webhook/`, `src/lib/stripe.ts` et
`supabase/migrations/20261030120000_stripe_subscription_projection.sql`.

**Livré :** les fiches et la liste commerçants affichent les noms commerciaux,
les droits de lieu et leur source. Le webhook signé conserve une projection
idempotente des lignes récurrentes, de l'échéance et de la résiliation Stripe ;
le MRR vient de cette projection, jamais des booléens de droit, et devient
explicitement indisponible si une souscription ne peut pas être rapprochée.

**Garde :** seuls les rôles `stripe.view` chargent ou voient montants, items,
échéances et MRR. Support et lecture seule conservent les informations
opérationnelles sans accéder aux données de facturation.

## Prérequis à poser

**VIT-6** — le projet Google Cloud et la clé existent. Reste à poser le secret
côté serveur : `GOOGLE_TRANSLATE_API_KEY`, sur Vercel (Preview + Production) et
dans `.env.local`. **Jamais `NEXT_PUBLIC_*`** : le préfixe expose la clé au
navigateur, et Google facture au caractère. Aucun autre lot n'attend un geste
extérieur.

## État réel

Le socle Vitrine/Réserver et les expériences déjà livrées sont sur `main`.
Ne pas les recréer : réutiliser leurs droits serveur `vitrine`, catalogue QR,
agenda/Réserver, registre de récompenses, portefeuille, check-in, file,
Expérience Signature, Quiz, Duo Miroir et Portrait de la Bande.

**Deux briques que l'on croit à construire existent déjà** : l'import de carte
par texte (`src/components/vitrine/import-carte.tsx`, `import-parse.ts`) et
l'éditeur de traductions multilingue avec sa route publique
(`src/app/dashboard/vitrine/traductions/`, `src/app/(player)/v/[slug]/[[...langue]]/`).
VIT-8 et VIT-6 les **étendent**, ils ne les remplacent pas.

Les lots ci-dessous sont **les seuls travaux produit actifs**. Ils sont tous
approuvés par l'utilisateur le **2026-08-22** et restent à développer.

## Ordre de construction

| # | Lot | Coût | Schéma | Dépend de |
|---|---|---|---|---|
| 0 | **VIT-11** Sortie neutre après jeu | faible | non | — |
| 1 | **VIT-8** Import Carte | moyen/élevé | oui | — |
| 2 | **VIT-6** Traduction Google | moyen | non | VIT-8 |
| 3 | **VIT-7** Photos Vitrine | moyen | oui | — |
| 4 | **VIT-9** Analyse « ce qui attire » | moyen | oui | partiellement VIT-10 |
| 5 | **VIT-10** Parcours fiche → décision | moyen | oui | — |
| 6 | **VIT-12** Vitrine dans Google | moyen | oui | VIT-7 + VIT-8 |
| 7 | **TKT-1** Ticket d'Or | moyen | oui | — |
| — | TKT-2 / TKT-3 | faible/moyen | oui | **pilote TKT-1 mesuré** |

VIT-11 ouvre parce qu'il ne coûte rien, ne touche pas au schéma et livre un
incrément visible en une passe. Les seules dépendances dures sont celles de la
colonne : le reste peut bouger.

**VIT-9 se livre en deux temps.** Les vues (carte, rubrique, fiche, langue) sont
mesurables dès aujourd'hui ; la moitié « clics vers une action » n'a de sens
qu'une fois VIT-10 livré. Livrer la première moitié à son rang plutôt que
d'attendre.

**Parallélisable :** un lot dont le travail se sépare en `src/lib` + `src/actions`
d'un côté et `src/app` + `src/components` de l'autre se traite en un seul
message, deux périmètres. VIT-7 (stockage / rendu) et VIT-9 (collecte / tableau)
s'y prêtent particulièrement.

Aucun commit, push, déploiement, migration distante, création de compte/projet
externe, secret ou opération Stripe n'est implicite.

## À développer

### VIT-11 — Sortie neutre après jeu

**État :** à faire · **Schéma :** non

**Terrain :** `src/components/quiz/quiz-experience.tsx`,
`src/components/duo/duo-experience.tsx`,
`src/components/bande/bande-experience.tsx` (les trois fins de jeu) ;
`src/components/vitrine/sommaire-vitrine.tsx` et `fiche-vitrine.tsx` (le retour
carte) ; `src/components/vitrine/reglages-vitrine.tsx` (où le commerçant saisit
ses liens) ; `src/lib/validations/vitrine.ts` (validation des URL).

**Promesse :** « Après un bon moment, le client peut garder le lien avec le lieu. »

- Un composant **réutilisable** aux fins de Quiz, Duo Miroir et Portrait de la
  Bande lancés depuis une Vitrine : retour à la carte, Instagram, TikTok et Avis
  Google si le commerce les a configurés.
- Le bloc est facultatif, discret et refermable.

**Écarté :** faire dépendre quoi que ce soit d'un avis. Aucun avis ne débloque
gain, remise, jeu, accès, rang ou réservation, et aucun filtrage de satisfaction
n'est acceptable — c'est une règle Google, pas une préférence.

**Fini quand :** `npm run typecheck` passe, `npx vitest run quiz duo bande vitrine`
est vert, le bloc n'apparaît que si au moins un lien est configuré, et il se
referme.

**Succès :** sorties choisies, jamais forcées. **Coût/risque :** faible.

### VIT-8 — Import Carte sans ressaisie

**État :** à faire · **Schéma :** oui (brouillon non publié)

**Terrain :** `src/components/vitrine/import-carte.tsx` et `import-parse.ts`
(**l'import texte actuel — c'est le repli, il reste**) ; `src/actions/vitrine.ts` ;
`src/lib/vitrine.ts` ; `src/lib/validations/vitrine.ts` ;
`src/app/dashboard/vitrine/page.tsx`.

**Promesse :** « J'envoie ma carte, je la relis, elle est prête. »

- Accepter PDF, image, CSV/XLSX et texte ; extraire une proposition de
  cartes/rubriques/fiches dans un **brouillon non publié**.
- L'analyse de PDF/image et l'OCR tournent **côté LastChance** : ils produisent
  des champs structurés, pas une traduction. Ce résultat devient la seule source
  envoyée ensuite à Google, après revue et publication.
- Le commerçant confirme chaque libellé, prix, allergène, disponibilité et image
  avant toute écriture publique.
- Un import de fichier ne doit jamais écraser une carte publiée sans comparaison
  et confirmation.

**Écarté :** la publication automatique, à cause des formats hétérogènes ;
l'OCR délégué à Google, parce qu'on n'envoie au fournisseur que des champs déjà
validés, jamais un PDF ni une image brute ; le remplacement de l'import texte,
qui reste le chemin sûr quand l'extraction échoue.

**Fini quand :** `npm run typecheck`, `npm run sql:check && npm run migrations:check`,
`node scripts/generate-db-types.mjs --local`, puis `npx vitest run vitrine` verts ;
un brouillon issu d'un fichier réel ne peut pas atteindre le public sans
confirmation explicite.

**Succès :** une carte réelle préparée sans saisie ligne par ligne, 100 % des
champs sensibles revus. **Coût/risque :** moyen/élevé.

### VIT-6 — Traduction automatique Google Cloud

**État :** à faire · **Schéma :** non · **Après VIT-8**

**Terrain :** `src/app/dashboard/vitrine/traductions/page.tsx`,
`src/components/vitrine/traductions-editeur.tsx`, `traduction-champ.tsx`,
`src/components/vitrine/langue.ts`, route publique
`src/app/(player)/v/[slug]/[[...langue]]/page.tsx`.
**Le multilingue existe déjà** : ce lot branche un fournisseur derrière
l'éditeur en place, il ne crée pas le routage par langue.

**Promesse :** « Un visiteur étranger lit la carte en anglais sans que le
commerçant traduise quoi que ce soit. »

- **Cloud Translation Basic**, serveur uniquement, FR → EN pour la première
  version. Conserver un adaptateur interne pour pouvoir passer à Advanced si un
  glossaire métier ou du traitement par lot le justifie réellement.
- La chaîne est : `fichier → extraction/OCR → brouillon structuré → validation →
  publication → traduction des seuls champs publiés`. Ne jamais envoyer le PDF,
  l'image brute, les répétitions ou les champs rejetés au fournisseur.
- Traduire **au choix volontaire du visiteur**, et seulement les champs publiés
  absents ou périmés. Google facture au caractère : sans ce déclencheur, on
  traduit tout, tout le temps.
- Cache par `organisation + langue + cible + champ + version source`. **`cible`
  fait partie de la clé** : sans elle, une deuxième langue fera collisionner les
  entrées. Le cache est une règle de produit, pas une optimisation facultative.
- Français en référence et en repli immédiat. Étiqueter la version comme
  traduction automatique. Prix, disponibilité, allergènes, alcool et
  informations pratiques restent accessibles en français.
- Limite de dépense/volume, métrique de caractères, arrêt propre du fournisseur.
- L'édition humaine existante reste un correctif facultatif, pas le chemin
  obligatoire du commerçant.

**Écarté :** Advanced dès la v1 (aucun glossaire à ce stade) ; l'appel depuis le
navigateur (la clé serait publique et la facturation incontrôlable) ; la
traduction déclenchée au chargement de la page.

**Fini quand :** `npm run typecheck` et `npx vitest run vitrine traduction` verts
— le filtre `traduction` ne trouve rien aujourd'hui, c'est le lot qui crée cette
suite — la clé n'apparaît dans aucun bundle client, et une seconde visite sur la
même version source ne produit **aucun** appel au fournisseur.

**Succès :** part des Vitrines anglaises servies depuis le cache, coût calculé
sur les seuls caractères validés, aucun champ alimentaire inventé.
**Coût/risque :** moyen.

### VIT-7 — Photos et identité visuelle Vitrine

**État :** à faire · **Schéma :** oui (médias)

**Terrain :** `src/lib/poster-storage.ts` — **seul helper de stockage du dépôt**
(bucket `POSTER_IMAGES_BUCKET`) : s'en inspirer pour l'isolation et les bornes,
sans y ranger les photos Vitrine ; `src/components/vitrine/fiche-vitrine.tsx`,
`catalogue-vitrine.tsx`, `reglages-vitrine.tsx` ; `src/actions/vitrine.ts`.

**Promesse :** « Ma carte donne envie avant même que le client lise tout. »

- Couverture du lieu et **photos de fiches** — Vitrine n'est pas réservée à la
  restauration : le mot « plats » referme le lot sur l'HORECA.
- Upload isolé par organisation, types et poids bornés, suppression, quotas,
  compression et variantes adaptées au mobile.
- Recadrage et texte alternatif ; retrait des métadonnées inutiles — **EXIF de
  localisation en particulier** — avant publication.
- Un rendu élégant sans photo reste obligatoire.

**Écarté :** générer ou présumer l'image d'un produit.

**Fini quand :** `npm run typecheck`, gardes SQL et types locaux verts,
`npx vitest run vitrine` vert ; une image d'une autre organisation est
inatteignable, et l'EXIF de localisation a disparu du fichier servi.

**Succès :** une Vitrine complète reste rapide sur mobile et chaque média est
remplaçable par son commerce. **Coût/risque :** moyen.

### VIT-9 — Analyse « ce qui attire »

**État :** à faire · **Schéma :** oui (événements) · **Livrable en deux temps**

**Terrain :** `src/lib/experience-analytics-dashboard.ts` — **le précédent** :
tableau agrégé par période, déjà écrit, à imiter plutôt qu'à refaire ;
`src/lib/activation/events.ts` ; côté collecte
`src/app/(player)/v/[slug]/[[...langue]]/page.tsx` ; côté restitution
`src/app/dashboard/vitrine/page.tsx`.

**Promesse :** « Je sais ce que mes clients regardent et ce qui les fait agir. »

- Mesurer de façon **agrégée** : ouverture, carte/rubrique/fiche consultée,
  langue — puis, après VIT-10, clic vers Boussole, Réserver, Expérience
  Signature ou jeu.
- Tableau commerçant **par période** : contenus les plus regardés, intentions
  déclenchées.
- Respecter l'organisation active, la minimisation des données et la politique
  de consentement existante.

**Écarté :** appeler ces mesures des ventes ; créer un profil individuel ou une
note cachée.

**Fini quand :** `npm run typecheck`, gardes SQL et types locaux verts,
`npx vitest run vitrine analytics` vert ; aucune ligne ne permet de remonter à
une personne.

**Succès :** le commerce choisit une mise en avant à partir d'un signal lisible.
**Coût/risque :** moyen.

### VIT-10 — Parcours « de la fiche à la décision » et Boussole

**État :** à faire · **Schéma :** oui (action par fiche)

**Terrain :** `src/components/vitrine/fiche-vitrine.tsx`, `sommaire-vitrine.tsx` ;
`src/lib/reserver.ts`, `src/lib/reserver-context.ts` (créneaux) ;
`src/lib/activation/vitrine.ts` et `src/lib/activation/reserver.ts` (droits) ;
`src/components/reserver/reserver-experience.tsx`.
**La Boussole n'existe pas** — c'est le seul composant réellement neuf du lot.

**Promesse :** « Une carte ne se contente plus de présenter : elle aide à
choisir puis à venir. »

- Une fiche ou rubrique propose **au plus une** action configurée : Boussole,
  créneau Réserver, Moment Signature, Atelier Duo, offre de stock ou jeu
  facultatif. C'est la contrainte qui empêche la fiche de devenir un menu de
  liens.
- **Boussole de choix** : quelques questions fermées et temporaires (occasion,
  temps disponible, envie, seul/à plusieurs) renvoyant vers des fiches et
  expériences **réellement configurées** par le commerce.
- Désactiver proprement une action quand sa fiche, son activité ou son offre
  n'est plus publiée.

**Écarté :** toute recommandation médicale, toute inférence d'allergène, tout
profil durable, et tout effet sur la file, le rang, la capacité ou le droit à
une réservation.

**Fini quand :** `npm run typecheck`, gardes SQL et types locaux verts,
`npx vitest run vitrine reserver` vert ; une action dont la cible est dépubliée
disparaît de la fiche.

**Succès :** clic fiche → action et réservation/intention, sans promesse de
vente causale. **Coût/risque :** moyen.

### VIT-12 — Vitrine qui attire depuis Google

**État :** à faire · **Schéma :** oui (opt-in) · **Après VIT-7 + VIT-8**

**Terrain :** `src/app/(player)/v/[slug]/[[...langue]]/page.tsx` **ligne 132** —
`robots: { index: false }`, la ligne exacte à rendre conditionnelle.
`src/app/sitemap.ts` et `src/app/robots.ts` **n'existent pas** : à créer ;
`site/src/app/sitemap.ts` est le précédent à imiter.
Réglages : `src/components/vitrine/reglages-vitrine.tsx`.

**Promesse :** « Mon commerce peut être découvert avant le QR code. »

- Indexation **opt-in**, possible seulement pour une Vitrine publiée, complète
  et explicitement autorisée par le commerçant.
- Générer titre, description, canonical, Open Graph, sitemap et données
  structurées de lieu/menu à partir des seules données validées.
- Prévoir un aperçu et un bouton de retrait. **Le retrait rétablit `noindex`
  immédiatement côté application, sans promettre l'effacement des index
  externes** — c'est ce qui protège d'une promesse intenable.

**Écarté :** publier dans Google une disponibilité, un prix, un avis ou une note
qui ne serait pas exact.

**Fini quand :** `npm run typecheck`, gardes SQL et types locaux verts,
`npx vitest run vitrine` vert ; une Vitrine non autorisée sert toujours
`noindex`, et le sitemap ne contient que les Vitrines opt-in.

**Succès :** impressions/clics organiques et visites de Vitrine, distincts des
scans QR. **Coût/risque :** moyen.

### TKT-1 — Ticket d'Or

**État :** à faire · **Schéma :** oui (tickets)

**Terrain :** `src/lib/lot-tirable.ts` (tirage et stock serveur) ;
`src/lib/caisse-remise.ts` (remise en caisse) ;
`src/lib/validations/reward-expiry.ts` (expiration) ;
`src/app/(player)/portefeuille/page.tsx` et
`src/components/wallet/player-wallet-screen.tsx` ;
`src/components/reserver/arrivees-checkin.tsx` et
`src/components/dashboard/jackpot-staff-checkin.tsx` (le précédent de la preuve
de présence).

**Promesse :** « Une visite aujourd'hui donne une bonne raison de revenir. »

- Après une visite ou un achat **vérifié** par le staff (check-in ou code de
  commande unique), remettre une chance unique, bornée et expirante, à utiliser
  lors d'un prochain passage.
- Réemployer le registre de récompenses, le portefeuille et la caisse existants.
  Résultat et stock décidés **côté serveur**.
- Un QR statique ou une capture d'écran ne prouve jamais un achat : suivre le
  motif des secrets `*_CHECKIN_TOKEN_SECRET` déjà en place (`JACKPOT_`,
  `LOYALTY_`), jamais un identifiant devinable.
- Mesurer activation, remise et retour à 30 jours.

**Écarté :** attribuer un panier ou un revenu sans preuve ; émettre un Ticket
d'Or de valeur au seul scan.

**Fini quand :** `npm run typecheck`, gardes SQL et types locaux verts,
`npx vitest run ticket portefeuille caisse` vert — le filtre `ticket` ne trouve
rien aujourd'hui, c'est le lot qui crée cette suite — et un ticket ne peut être
émis deux fois pour la même visite, ni consommé après expiration.

**Succès :** une boucle visite → retour mesurable, compréhensible en une phrase.
**Coût/risque :** moyen.

### TKT-2 — Minute Chance et TKT-3 — Coffre des habitués

**État :** en attente d'un **pilote TKT-1 mesuré**. Ne pas construire trois
boucles de retour avant d'en avoir prouvé une.

- **Minute Chance** : fenêtre réellement limitée pour remplir un créneau calme,
  budget/stock et éligibilité décidés serveur. Une affiche QR reste une adresse
  publique, jamais la preuve d'une présence.
- **Coffre des habitués** : présentation commerciale du Passeport **déjà
  existant**, pas un second moteur de fidélité. Rendre lisible le prochain palier
  et le bénéfice de revenir, sans récompense ni compteur parallèle.

**Succès :** participations et retours réellement mesurés, sans rareté fictive
ni revenu supposé. **Coût/risque :** faible/moyen.

## Garde-fous de périmètre

Ces règles valent pour **tous** les lots ; elles ne sont plus répétées lot par
lot.

- **Jamais de déduction** : ni allergène, ni alcool, ni prix, ni disponibilité,
  ni stock. Le système ne devine aucune information alimentaire ou commerciale.
- **Rien de public sans confirmation humaine** du commerçant.
- Tout nouvel accès public, média, import ou appel externe est **org-scopé,
  validé côté serveur** et soumis à revue sécurité.
- Vitrine s'inspire du niveau de finition Mennoo, **sans copier** interface,
  code, contenus ou marque.
- Le produit reste un catalogue/expérience : pas de POS, commande à table,
  appel serveur, addition, paiement, cuisine, livraison, synchronisation caisse
  ou stock temps réel.
- Les jeux restent volontaires et ne modifient jamais rang, accès, priorité,
  capacité, heure promise ou éligibilité de Réserver.
- CRM Vitrine : faits minimaux, consentements, réservations/arrivées/interactions
  et segments factuels seulement ; pas de pipeline commercial, enrichissement,
  scoring opaque, notes libres ou marketing sans consentement séparé.

## Mise à jour de ce fichier

Mettre à jour **la ligne d'état du lot**, ne pas ajouter de journal ni conserver
une ancienne version. Le format est fixe, pour que la contradiction avec
`docs/roadmap.md` se voie en une ligne :

```
**État :** à faire | en cours (`branche`) | livré (ADR-nnn)
```

Lorsqu'un lot passe à « livré », sa preuve part dans la roadmap, le tracker, les
ADR ou le journal, et **son bloc quitte ce fichier** : il revient immédiatement à
la seule liste de décisions ouvertes.
