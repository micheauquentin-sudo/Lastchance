# Transmission Codex → Claude Code

> Document local de référence. Claude Code le lit avant toute mission demandée
> par l'utilisateur. Codex le met à jour après chaque audit, décision, lot
> validé ou constat d'écart.

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
- Claude exécute le besoin demandé par l'utilisateur en tenant compte de ce
  document. Il ne supprime jamais les lignes ni ne modifie ce cahier des
  charges ; il termine par un résumé court pour l'utilisateur.
- Codex compare ce document au dépôt lors de sa prochaine revue. Toute ligne
  prouvée comme faite passe dans **Terminé** ; seules les lignes non réalisées
  restent dans **À exécuter** ou **Bloqué**.

## Dernière demande utilisateur

Codex pilote le développement de LastChance. Les audits doivent être précis et
transverses ; les propositions doivent améliorer concrètement l'expérience des
commerçants et des joueurs, la performance ou la sécurité. Chaque demande,
constat, proposition et décision Codex doit être consigné ici.

## Chasse au QR — gain, Passeport et caisse (2026-08-26)

- **Décision produit appliquée localement** : le nom commercial visible
  devient « Chasse au QR » sur le dashboard, le parcours joueur, les
  emails, les plans et le site vitrine. Les routes `/hunt`, clés `hunts`,
  jetons existants et codes `CHASSE-…` restent inchangés.
- **Parcours gagnant** : après un code de retrait effectivement attribué, le
  joueur voit aussi son QR contenant ce code, directement lisible par le
  scanner de caisse existant. Le Passeport n'est proposé qu'à ce gagnant,
  reste absent sans programme Fidélité actif de la même organisation et
  aucune écriture n'a lieu sans clic volontaire du joueur.
- **Preuves** : 6 022 tests unitaires, typecheck, lint, build racine (201 s)
  et typecheck/lint/build du site vitrine verts. Le catalogue du site a été
  régénéré depuis `src/lib/plans.ts`. Revue sécurité ciblée : le QR ne
  transporte que le code déjà affiché et la caisse revalide toujours
  organisation, session et code côté serveur.
- **Publication** : accord propriétaire reçu ; PR #202 ouverte avec le commit
  `ccf3f3b`, complété par `fc8e346` pour faire évoluer l'E2E avec le nouveau
  libellé et le QR. La fusion vers `main` reste conditionnée à la CI complète
  verte. Aucun déploiement de production n'est demandé.

## Ticket d'Or — émission bloquée (2026-08-25)

- **Cause confirmée** : `emettreTicketOr` appelait `emettre_ticket_or` avec
  le client `service_role`, alors que la RPC exige le `auth.uid()` d'un membre
  via `is_org_member`. Elle renvoyait donc `not_authorized`, masqué par le
  message générique observé au comptoir.
- **Corrigé** : l'émission utilise désormais
  le client de session dans `src/actions/ticket-or.ts`; le rate-limit, la
  validation des jours et l'organisation active sont conservés. Le test
  `src/actions/ticket-or.test.ts` couvre le client de session, l'absence
  d'appel admin, les bornes et la réponse de succès.
- **Preuves** : 6 019 tests unitaires complets, typecheck, lint et build
  Next.js (181 s) verts. Revue de sécurité : la RPC reçoit de nouveau
  l'identité qui permet son contrôle multi-tenant ; aucun droit n'est
  élargi, aucune migration n'est requise.
- **Publication** : commit `f393072`, PR #201 fusionnée dans `main` après CI
  entièrement verte. Aucun déploiement de production n'a été demandé.

## Ticket d'Or — lots invisibles après création (2026-08-25)

- **Cause confirmée** : la création insérait correctement le lot, mais
  `loadTicketOr` appelait `tickets_or_state` avec le client `service_role`.
  Cette RPC exige `auth.uid()` via `is_org_member`, retournait
  `not_authorized`, puis l'écran le transformait silencieusement en liste vide.
- **Corrigé** : la lecture de l'état passe
  maintenant par le client de session dans `src/lib/ticket-or-context.ts` ;
  l'insertion reste côté serveur avec sa garde propriétaire/éditeur. La
  création dans `src/components/ticket/lots-ticket.tsx` recharge ensuite la
  page canoniquement, pour rendre le lot visible même si le rafraîchissement
  RSC ne s'applique pas.
- **Preuves** : 22 tests ciblés puis 6 018 tests unitaires complets, typecheck,
  lint et build Next.js (177 s) verts. Revue de sécurité ciblée : lecture
  bornée à la session et au
  tenant, aucun élargissement des droits d'écriture. Aucune migration requise.
- **Publication** : commit `281c625`, PR #200 fusionnée dans `main` après CI
  entièrement verte. Aucun déploiement de production n'a été demandé.

## Réglages dashboard — grille large (2026-08-25)

- **Constat traité localement** : la page Réglages empilait toutes ses cartes
  dans une unique colonne étroite, sans utiliser l'espace disponible sur grand
  écran.
- **Livré** :
  `src/app/dashboard/settings/page.tsx` utilise désormais une grille d'une
  colonne puis deux colonnes à partir de `lg`; les cartes Webhooks sortants et
  Abonnement occupent les deux colonnes. Le squelette associé
  (`src/app/dashboard/settings/loading.tsx`) suit la même structure avec onze
  cartes, dont les deux dernières étendues. Le test statique
  `src/app/dashboard/settings/settings-layout.test.ts` verrouille cette
  convention.
- **Preuves locales** : test ciblé 12/12, `npm run typecheck`, `npm run lint`
  et `npm run build` (175 s) verts.
- **Publication** : commit `51341cf`, PR #199 fusionnée dans `main` après CI
  entièrement verte. Aucun déploiement de production n'a été demandé.

## Simplification dashboard, Clients Calendrier et portes Vitrine (2026-08-25)

- **Décision produit, faite localement** : la Carte de l'Aventure est retirée
  de toutes les pages dashboard qui la proposaient. L'accueil ne montre plus
  « Votre prochaine action », le Conseiller ni « Bien démarrer » ; le Centre
  d'animation et le tableau d'équipe restent les seuls repères d'action.
- **Défaut Clients corrigé** : `joinCalendar` enregistrait déjà l'opt-in
  newsletter, mais la RPC Clients ne partait que des gains. Un abonné actif issu
  du Calendrier apparaît désormais dans son organisation avec `0` gain et des
  dates de gain absentes (jamais une date inventée), sans dupliquer un joueur.
  Les sources non-Calendrier, désabonnements et organisations voisines restent
  exclus.
- **Vitrine publique** : le bloc d'expériences déjà activé par le commerçant
  propose aussi les Calendriers actifs et les Pronostics accessibles, après les
  jeux existants. Les droits module Calendrier et droit Pronostics par ressource
  sont revalidés dans la lecture publique ; aucun brouillon, contact ou donnée
  inter-tenant n'est exposé.
- **Preuves** : 6 013 tests unitaires, 5 530 assertions pgTAP, typecheck, lint,
  gardes SQL/migrations et build Next.js sont verts. Revue sécurité ciblée :
  aucun finding critique ou moyen sur ce lot.
- **Reste** : aucun commit, push, migration distante ou déploiement n'a été
  effectué. Attendre l'accord propriétaire explicite pour créer le commit et
  pousser ce lot vérifié vers `main`.

> Cette décision remplace les propositions historiques ci-dessous qui suggèrent
> encore la Carte de l'Aventure ou un parcours de guidage sur l'accueil : elles
> ne doivent plus être reprises.

## Correctifs Duo et Bande (2026-08-25)

- **Vitrine publique, livré** : le commit `a135a18c` sur `main` rend le bloc
  facultatif `experiences` explicitement activable depuis le dashboard, sans
  changer le défaut protecteur des vitrines non configurées.
- **Dashboard, constat P0** : les pages `/dashboard/salons/duo` et
  `/dashboard/salons/bande` montaient bien leur en-tête, mais
  `ModuleCapabilityNotice` retournait `null` lorsque `canPublish` était vrai.
  Il supprimait ainsi son propre contenu chez les commerçants autorisés, au
  lieu de seulement retirer le bandeau d'offre.
- **Correctif** : le composant rend désormais `children` sans bandeau pour un
  module publiable. La protection, le message et l'offre restent inchangés
  lorsque la publication est fermée. Le test prouve les deux états.
- **Portée vérifiée** : le même composant enveloppe aussi d'autres écrans de
  modules ; le correctif rétablit leur contenu pour les comptes concernés,
  sans changement SQL, Stripe, autorisation ou route publique.
- **Preuves locales** : 10 tests ciblés verts ; typecheck vert ; lint vert ;
  `npm run build` vert. La CI GitHub doit confirmer le SHA livré avant toute
  publication Vercel.

## À LIRE EN PREMIER — dossier de reprise Claude (2026-08-03)

Ce bloc est l'index opérationnel du fichier. Les sections détaillées plus bas
constituent la preuve et le cahier des charges ; ne pas relire les anciennes
propositions comme des décisions actuelles. Aucun code de ces lots n'est
autorisé à être intégré, publié ou déployé sans les gates et l'accord
propriétaire prévus ci-dessous.

### Ordre des chantiers retenu

1. **Préserver et qualifier le chantier Claude déjà en cours** dans son
   worktree : scan sur son SHA exact, CI/QA, puis demande d'accord séparée.
   Ne pas le modifier depuis un autre lot.
2. **P0 — découverte, droits et publication payante** : tous les modules
   explorables/brouillonnables, mais publication structurellement interdite
   sans droit effectif. C'est le préalable de tout dashboard/QR.
3. **P1 — QR universels** : chaque expérience joueur publiable possède son QR
   imprimable, sans exposer un brouillon ou un droit suspendu.
4. **P1 — dashboard** : le Centre d'animation et le Tableau d'équipe sont
   conservés ; la Carte de l'Aventure et les parcours de guidage ont été
   écartés par décision propriétaire le 2026-08-25.
5. **P1/P2 — continuité Passeport** : proposer au joueur de créer/continuer
   son passeport après un jeu ; livraison/e-commerce par cartes QR uniques
   seulement après le QR universel.
6. **P2 — IA MVP**, puis Mode Répétition si la valeur du parcours guidé est
   confirmée. L'IA reste un assistant créatif éditable, jamais un décideur.

### Décisions produit confirmées

- Offres : **Coup d'envoi**, **Le Club**, **Le Grand Jeu**, **La Totale**.
- Tous les add-ons sont achetables indépendamment ; tout le dashboard est
  visible, mais seul un droit effectif exact permet de publier.
- Un lien n'est jamais l'unique entrée joueur : tout jeu publiable reçoit un
  QR ; une URL directe reste compatible.
- QR/lien partagé : création possible du passeport, **sans tampon**. QR
  officiel éligible ou achat/caisse validé : tampon, de façon idempotente.
- Carte QR unique dans un sac/colis : crée ou continue le Passeport et ajoute
  un tampon après confirmation du joueur ; cartes génériques = zéro tampon.
- Dashboard : Tableau d'équipe et Centre d'animation sont conservés. Carte de
  l'Aventure, Conseiller, « Votre prochaine action » et « Bien démarrer » sont
  retirés par décision propriétaire le 2026-08-25.
- IA : aide au choix et trois idées éditables, sortie structurée côté serveur,
  sans PII joueur, publication, paiement ni action automatique.

### Ne pas inclure sans une nouvelle demande explicite

Passeport des découvertes, Bingo de quartier, Kit de lancement, prochaine
meilleure action, mini-retour joueur, Coffre à lots, Player Hub complet,
Calendrier d'occasions, multi-établissement, intégrations caisse, intégration
API Uber/Deliveroo et le jeu de déduction sociale « La Nuit des Masques ».

### Garde-fous de reprise

- Lire `CLAUDE.md`, les états `.claude/state/`, ce fichier et `git status` ;
  noter le SHA de base et créer un worktree propre par lot.
- Ne pas reprendre `comp_access` comme droit à tous les modules. Aucun statut
  public ne doit être modifiable via PostgREST sans garde SQL effective.
- Une aide UI, QR, IA ou carte équipe ne vaut jamais autorisation : actions,
  RPC et routes publiques revalident rôle, organisation, ressource, statut et
  entitlement. Aucun PII/secrets dans QR, prompts ou logs.
- Avant publication : revue du diff, migration replay/seed/pgTAP si données,
  typecheck, lint, unit, build, E2E, revue sécurité ; mesure de capacité live
  séparée avant toute promesse de jauge. Commit/push/déploiement/migration
  distante demandent l'accord propriétaire explicite.

### Parcours unique d'assemblage des socles dashboard (2026-08-03)

Les cinq socles ci-dessous sont des fichiers **non suivis** dans cinq worktrees
locaux differents. Ils servent de chemin de reprise, pas de livraison deja
integree. Ne pas les melanger ni les publier tels quels : reprendre un socle,
le connecter a une source de verite, tester, puis seulement passer au suivant.

| Ordre | Socle / worktree | Condition d'entree | Premier branchement | Test de sortie indispensable |
| --- | --- | --- | --- | --- |
| 0 | P0 droits/publication | aucune | droits effectifs dans actions, routes et SQL | owner/editor/cashier, org etrangere, droit suspendu, brouillon |
| 1 | QR — `Lastchance-qr-share-starter` | P0 prouve | un editeur pilote, URL publique server-side | brouillon masque ; QR/lien sans secret ; scan public autorise seulement |
| 2 | Carte de l'Aventure — `Lastchance-guided-journey-starter` | **Écarté le 2026-08-25** | ne pas reprendre | décision propriétaire de simplification |
| 3 | Relancer — `Lastchance-relaunch-card-starter` | garde serveur de duplication renforcee | campagnes uniquement au debut | source terminee, owner/editor, meme org ; aucune donnee joueur/QR/date copiee |
| 4 | Centre + Tableau d'equipe — `Lastchance-animation-center-starter` puis `Lastchance-team-board-starter` | projection serveur org-scopee | accueil dashboard, sans liens d'abord | six compteurs justes ; aucune donnee contact ; lien absent hors `availableTo` |

**Methode de reprise :** travailler dans un worktree Claude propre sur son SHA
de depart, reprendre les fichiers d'un seul socle, relire le diff et lancer les
tests cibles du socle. Apres chaque integration, lancer au minimum typecheck,
lint et les tests concernes ; si le lot touche donnees ou acces, ajouter replay
de migration/seed/pgTAP et revue securite. Ne pas attendre les cinq socles pour
confirmer le premier parcours pilote fonctionnel, mais ne pas brancher un lien,
QR ou CTA avant sa garde serveur effective.

### Socle QR deja prepare par Codex (non integre, 2026-08-03)

Pour reduire le travail repetitif sans court-circuiter le P0, Codex a prepare
dans un worktree isole la carte frontend reutilisable suivante :

- Worktree local : `C:\Users\MISHOW\Documents\LastChance\Lastchance-qr-share-starter`
  sur la branche locale `codex/qr-share-card-starter` ; **aucun commit, push,
  migration, route, action serveur ou ecran existant n'a ete modifie**.
- Fichiers a reprendre apres le P0 :
  `src/components/dashboard/public-share-card.tsx`,
  `src/components/dashboard/public-share-card-state.ts` et son test.
- Contrat : `PublicShareCard({ experienceLabel, publicUrl, isPublished })`.
  Elle affiche QR + lien copiable seulement si le domaine appelant lui transmet
  une URL web deja publique et `isPublished: true`. Elle masque QR/lien pour un
  brouillon ou une URL invalide. Cette condition est une protection d'interface,
  jamais une autorisation : routes, actions et RLS restent les sources de
  verite.
- Preuves locales : `vitest run
  src/components/dashboard/public-share-card-state.test.ts` = 4 tests verts ;
  controle de syntaxe TypeScript et `git diff --check` verts. Le typecheck/lint
  global n'a pas ete lance dans ce worktree car il ne contient pas son propre
  `node_modules` ; les dependances du worktree Claude doivent etre utilisees
  pour les gates completes.

**Reprise guidee pour Claude :** ne pas l'inserer dans un editeur avant la garde
P0 effective. Ensuite, chaque domaine construit cote serveur son URL publique,
revalide statut + organisation + entitlement dans sa route/action, puis passe
ces trois props a la carte. Commencer par l'experience la plus simple et couvrir
un brouillon, un droit suspendu, une organisation etrangere et un QR scanne.
Le QR ne contient aucun secret et ne donne aucun droit par lui-meme.

### Socle Carte de l'Aventure préparé par Codex (historique écarté le 2026-08-25)

Un second micro-lot frontend, independant du QR, est pret dans le worktree
local `C:\Users\MISHOW\Documents\LastChance\Lastchance-guided-journey-starter`
sur la branche locale `codex/guided-journey-starter`. Aucun ecran existant,
route, action serveur, migration, commit ou publication n'est modifie.

- Fichiers a reprendre : `src/components/dashboard/guided-journey.tsx`,
  `guided-journey-state.ts` et son test.
- La carte cartoon affiche l'avancement, les jalons et une seule prochaine
  action. Une etape peut etre `complete`, `current`, `upcoming` ou `blocked`.
  Une etape bloquee affiche son motif et **n'a pas de lien** ; elle ne promet
  donc jamais une action que le moteur refuserait.
- Le parent doit filtrer les etapes inaccessibles selon role, organisation,
  statut et droit effectif, puis fournir seulement des liens deja autorises.
  Le composant ne decide aucun droit et les routes/actions restent les gardes.
- Preuves locales : test Vitest cible = 5 tests verts, controle de syntaxe
  TypeScript et `git diff --check` verts. Rejouer typecheck/lint/build/E2E dans
  le worktree Claude apres integration ; ce socle seul n'est pas publiable.

**Reprise guidee pour Claude :** apres le P0, l'inserer d'abord dans un seul
editeur pilote (Quiz ou Chasse), avec quatre jalons reels : idee, brouillon,
verification, publication/QR. Tester owner/editor/cashier, brouillon, droit
suspendu et organisation etrangere : aucun jalon impossible ne doit etre
compte, cliquable ou presente comme une prochaine action.

### Socle Relancer une formule deja prepare par Codex (non integre, 2026-08-03)

Un troisieme micro-lot frontend est pret dans le worktree local
`C:\Users\MISHOW\Documents\LastChance\Lastchance-relaunch-card-starter`,
branche locale `codex/relaunch-card-starter`. Il contient uniquement
`relaunch-formula-card.tsx`, `relaunch-formula-state.ts` et son test : aucun
ecran existant, route, action serveur, migration, commit ou publication n'est
modifie.

- La carte explique clairement ce qui serait repris dans un nouveau brouillon,
  ce qui doit etre reverifie et ce qui ne sera jamais copie (participants,
  gains/codes, scans, historique, donnees joueur). Elle ne cree rien et ne
  contient volontairement aucun identifiant, lien ou bouton de creation.
- Elle est eligible seulement pour une source terminee, un type supporte et un
  `canCreateDraft` deja calcule serveur (owner/editor, meme organisation).
  Sinon elle affiche le motif, sans promesse trompeuse.
- Le moteur existant `duplicateCampaign` (`src/actions/campaigns.ts`) cree bien
  un brouillon et evite QR/dates/auto-schedule/historique, mais ne porte pas
  encore explicitement les gardes role + source terminee requises ici. Ne pas
  relier cette carte a ce moteur avant leur correction P0 cote serveur.
- Preuves locales : Vitest cible = 4 tests verts, controle de syntaxe
  TypeScript et `git diff --check` verts. Rejouer les gates complets dans le
  worktree Claude apres integration.

**Reprise guidee pour Claude :** renforcer d'abord `duplicateCampaign` avec
role owner/editor, organisation de la source, etat terminal et support reel de
la copie. Ajouter ensuite l'action serveur/formulaire uniquement si ces gardes
passent ; revalider que QR, dates, diffusion, participants et donnees joueur ne
sont pas dupliques. Le composant est informatif tant que cette preuve manque.

### Socle Tableau d'equipe deja prepare par Codex (non integre, 2026-08-03)

Le micro-lot visuel est pret dans
`C:\Users\MISHOW\Documents\LastChance\Lastchance-team-board-starter`, branche
locale `codex/team-board-starter`. Il ajoute seulement
`team-action-board.tsx`, son etat pur et son test ; aucun chargement de membre,
adresse e-mail, mutation, route, commit ou publication.

- La carte affiche qui doit agir (Proprietaire, Editeur, Caisse), les actions
  faites, bloquees et disponibles. Une responsabilite hors droits reste visible
  pour que l'equipe comprenne qui doit intervenir.
- Son contrat exige `actorRole` et `availableTo` calcules par le parent serveur.
  Une action ne contient un lien que si le role courant est explicitement dans
  `availableTo`; aucun role n'est suppose plus puissant qu'un autre. Une action
  bloquee ou terminee n'est jamais cliquable.
- Les routes, Server Actions et RLS gardent l'autorite. Cette vue ne charge pas
  la liste de l'equipe : `/dashboard/team` est owner-only et aucune information
  de contact ne doit etre diffusee dans un tableau transverse.
- Preuves locales : Vitest cible = 5 tests verts, controle de syntaxe TypeScript
  et `git diff --check` verts. Rejouer les gates complets dans le worktree
  Claude apres integration.

**Reprise guidee pour Claude :** brancher d'abord ce composant dans le futur
Centre d'animation avec des actions reelles et deja autorisees. Couvrir owner,
editor, cashier et role absent ; le lien d'une action non autorisee ne doit pas
etre rendu, meme si la carte reste visible. Ne pas y joindre les e-mails de
l'equipe ni inferrer les droits depuis le seul role.

### Socle Centre d'animation deja prepare par Codex (non integre, 2026-08-03)

Le socle passif est pret dans
`C:\Users\MISHOW\Documents\LastChance\Lastchance-animation-center-starter`,
branche locale `codex/animation-center-starter`. Il ajoute
`animation-center.tsx`, son etat pur et son test ; il ne fait aucune requete,
mutation, navigation, migration, commit ou publication.

- Il affiche les six reperes confirmes : brouillons, QR a tester, animations en
  cours, lots a stock faible, gains a remettre et taches d'equipe. Les compteurs
  sont deja calcules cote page/RPC ; valeurs invalides normalisees a zero et
  alertes explicites, sans couleur seule.
- Les cartes sont volontairement sans lien/bouton. Le resume actuel
  `org_dashboard_summary` ne couvre que campagnes/QR et gains de roue ; il ne
  peut pas servir de source de verite aux six familles. Stocks faibles et gains
  a remettre sont transverses et devront etre consolides apres le P0.
- Accessibilite : section titree, liste de six elements, compteurs lisibles et
  aucune region live pour ce snapshot serveur.
- Preuves locales : Vitest cible = 4 tests verts, controle de syntaxe
  TypeScript et `git diff --check` verts. Rejouer les gates complets dans le
  worktree Claude apres integration.

**Reprise guidee pour Claude :** ne pas ajouter six requetes client ni inventer
de compteur. Definir une projection serveur org-scopee apres les droits P0,
avec les semantiques exactes de chaque source, puis brancher les cartes a des
liens seulement quand leurs routes sont autorisees. Verifier owner/editor/
cashier, organisation etrangere, stock nul/faible, gain deja remis et absence
de QR public.

**Sections à lire ensuite :** lot P0 droits, dashboard guidé, IA, QR universels,
Passeport post-jeu et livraison/e-commerce — voir les titres correspondants dans
le reste du fichier.

## Registre Codex

| Date | Type | Décision / proposition | État |
| --- | --- | --- | --- |
| 2026-07-28 | Gouvernance | Audits complets menés avec les agents Codex pertinents ; propositions filtrées par impact client, preuve, risque et coût. | Actif |

## Dernier constat Codex — 2026-07-28

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

## Constat Codex — 2026-08-02 : lot « cadence-file » intégré, à revalider

- Lecture locale uniquement : Codex n'accède pas à une session Claude. Le lot a
  depuis été intégré à `main` par le commit `aeb4663` (#84). Les références à la
  branche de travail ci-dessous sont historiques et ne définissent pas un lot
  encore ouvert.
- Objet : rendre activable de façon sûre la cadence rapide (5 min) du worker de
  file `jobs` — notamment les envois SMS — en écrivant, depuis une Server Action
  réservée au super-admin, l'URL du worker et le `CRON_SECRET` déjà détenu par
  l'application dans le Vault. Aucun secret ne doit atteindre le navigateur,
  les erreurs, Sentry ou l'audit.
- Correctif applicatif désormais commité localement : la RPC de Vault renvoie les refus
  métier sous forme de statut pour éviter que PostgreSQL journalise ses
  paramètres. L'action et son panneau sont adaptés pour ne pas confondre un
  refus retourné avec un succès, tracer le refus sans secret, ne plus retourner
  l'URL au client, et rendre visible qu'une entrée Vault partagée touche aussi
  `sync-contests`.
- État : intégré, mais pas encore revalidé par Codex (tests, revue sécurité et
  comportement de production). Aucun déploiement ou migration distante n'est
  attribuable à cette vérification.

## Proposition Codex — 2026-08-01 : lots parallèles sans collision

- Précondition non négociable : tout nouveau lot de code part d'un `git
  worktree` distinct, basé sur `main`, afin de préserver les modifications
  locales existantes.
- **P0 — Cohérence des tarifs du site public** : `site/src/content/pricing.ts`
  affiche Core à 29 EUR mais masque encore les prix Engagement / Live / Full,
  alors que `src/lib/plans.ts` porte 59 / 89 / 129 EUR. Corriger via une source
  partagée ou un contrat de dérive, sans Stripe ni checkout. Bénéfice : offre
  lisible pour le prospect ; coût moyen ; risque produit moyen (prix à confirmer
  publiables), collision nulle avec le chantier worker.
- **P1 — Démonstration interactive multi-expériences : abandonnée à la demande
  de l'utilisateur, le 2026-08-02.** Le worktree `codex/multi-game-demo` et sa
  branche locale ont été supprimés ; aucun commit, push ou déploiement n'a été
  réalisé. Ne pas reprendre ce lot sans une nouvelle demande explicite et sans
  repartir de la direction artistique existante du site.
- **P2 — Simulateur ROI transparent** : moteur pur déjà présent dans
  `site/src/lib/roi.ts`, sans interface. Bénéfice : estimation personnalisable
  avant contact ; coût faible à moyen ; risque métier élevé tant que les
  hypothèses (taux de jeu, marge, gain) ne sont pas validées et affichées comme
  estimations, donc décision propriétaire requise avant code.
- **P2 — Flaky E2E méta-progression : constat antérieur à réviser.** Une
  vérification ultérieure du spec consigne 1 rouge sur 20 ; la nouvelle priorité
  P0 ci-dessous remplace donc la conclusion « déjà stabilisé ».

## Priorités Codex proposées — 2026-08-02 (démo écartée)

- **P0 — Corriger deux faux verts de concurrence Stripe.** Les tests 400/409
  préremplissent aujourd'hui la base avant l'appel, donc ne déclenchent jamais
  l'erreur Stripe ni son chemin de reprise. Faire jeter `customers.create`,
  simuler ensuite l'écriture concurrente et vérifier que l'appel Stripe a eu
  lieu. Bénéfice : paiement sans doublon ni client orphelin réellement prouvé ;
  coût faible ; risque de code faible, mais frontière financière sensible ; pas
  de migration ni de mutation Stripe réelle.
- **P1 — Éteindre le flaky E2E de méta-progression.** La mesure actuellement
  documentée dans `e2e/progression.spec.ts` établit encore 1 rouge sur 20 : la
  saison créée n'apparaît pas toujours dans les 30 s. Diagnostiquer le défaut
  réel sans augmenter le délai, ajouter de retry ni rechargement qui masquerait
  le symptôme. Bénéfice : parcours commerçant fiable et CI non bloquée ; coût
  moyen ; risque faible si le test reste discriminant ; aucun accès Stripe,
  worker ou migration requis.
- **P1 — Mesurer la capacité des événements live.** Les offres promettent 500
  et 1 000 participants alors que la preuve existante simule uniquement le
  parcours `/play`. Établir un benchmark réel local puis préproduction avec
  p50/p95/p99, erreurs, connexions et Realtime. Bénéfice : ne pas vendre une
  salle instable ; coût élevé ; risque faible pour le produit car c'est d'abord
  de la mesure, sans mutation distante.
- **P1 — Préparer la bascule du registre universel de récompenses.** Le socle,
  le backfill et les compteurs existent, mais neuf replis historiques restent
  actifs. D'abord lire le SLO de production par famille ; ne retirer un repli
  qu'après une période à zéro, famille pilote d'abord et roue en dernier.
  Bénéfice : une source de vérité unique à la caisse ; coût moyen à élevé ;
  risque élevé sans cette mesure ; aucune migration requise pour démarrer
  l'observation.

## Livraison Codex — 2026-08-02 : P0 tests d'idempotence Stripe

- Correctif réalisé dans le worktree isolé `codex/stripe-idempotency-tests` :
  les deux tests 400/409 de `ensureStripeCustomer` ne préremplissent plus la
  base avant l'appel. Ils imposent maintenant la séquence lecture vide, erreur
  idempotente de `customers.create`, puis relecture de l'association gagnante,
  et vérifient que Stripe a bien été appelé une fois.
- Périmètre : `src/lib/stripe.test.ts` seulement. Aucun code de production,
  appel Stripe réel, migration, secret, commit, push ou déploiement.
- Preuves : revue QA indépendante, `npm test -- src/lib/stripe.test.ts` (57
  tests verts), `npm run typecheck`, `npm run lint` et `git diff --check`
  verts.
- Reste à décider : intégrer ce diff par un commit dédié, uniquement avec
  l'accord explicite du propriétaire.

## Terminé — à préserver

- Catalogue versionné de quatre offres : Core 29 €, Engagement 59 €, Live &
  Events 89 €, Full Platform 129 €.
- Accès aux modules et messages d'upgrade alignés sur ce catalogue dans le
  dashboard.
- Paiement sécurisé par identifiants Stripe d'environnement : aucune somme de
  vitrine n'est facturable directement.
- Claude a déclaré : tests unitaires, typecheck, lint, build et contrôles de
  migrations verts. Ces preuves devront être revérifiées avant publication.

## Cahier détaillé des six blocs restants

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

## Constat Codex — 2026-08-03 : état des travaux restants, lecture seule

- **Chantier Claude à préserver** : `chantier/derniers-ouverts` porte deux
  commits locaux au-dessus de `origin/main` (`4eeea6b`, `9b74990`) et la
  migration `20260903120000_purged_reward_grace.sql`. Il ne faut ni le
  modifier, ni le fusionner, ni réutiliser ses fichiers depuis cet arbre. Les
  worktrees dédiés Stripe, capacité événement et E2E progression restent eux
  aussi isolés.
- **Gate P0** : quand le lot sera finalisé, revue sécurité ciblée puis CI sur
  son SHA exact (replay/seed/pgTAP, types, lint, unit, build, E2E et CodeQL).
  Les E2E ne sont pas une preuve locale pour ce lot. Intégration, migration
  distante et déploiement exigent ensuite une autorisation explicite.
- **P0 distinct, à traiter dans un worktree neuf après ce gate** :
  `tryUniversalRedeem` retombe actuellement sur les neuf routes historiques
  pour toute erreur de RPC ; le repli doit être limité au cas de migration
  absente, les autres erreurs devant échouer et alerter.
- **P1/P2 établis** : capacité live 500/1000 non certifiée ;
  `loadHuntStepContext` reste non borné et `huntRecall` ne borne qu'un cookie
  coopératif ; sept familles de récompenses attendent une décision d'expiration
  ou de clôture ; deux contrôles de régression restent textuels et doivent
  devenir comportementaux. Les prérequis opérationnels SMS/commerciaux restent
  hors code (Brevo, STOP, AF2M, prix Stripe, premier succès weekly-digest).

## Proposition Codex — 2026-08-03 : grille d'offre à affiner avant publication

- **Constat prouvé** : le catalogue applicatif porte déjà Core 29 EUR,
  Engagement 59 EUR, Live & Events 89 EUR et Full Platform 129 EUR, avec un
  essai de 7 jours. Engagement et Live sont deux parcours parallèles : l'un
  ne doit jamais être présenté comme l'upgrade de l'autre, car il retirerait
  des droits. Le site public n'affiche encore que Core à ce prix et les trois
  autres « sur devis » ; aucun contrat ne garantit cette parité.
- **Positionnement proposé** : « Choisissez le résultat à obtenir, pas une
  liste de jeux » : Core = lancer une animation QR (acquérir) ; Engagement =
  faire revenir (fidélité, calendrier, parrainage, chasse, quiz) ; Live &
  Events = animer un temps fort (événement, pronostics, jackpot, quiz) ; Full
  = réunir les deux parcours, 19 EUR sous l'achat des deux offres séparées.
  Conserver les prix comme hypothèses de lancement jusqu'aux premiers pilotes.
- **Bornes** : ne pas vendre de volume, SLA, multi-établissement,
  accompagnement, SMS inclus ou capacité live garantie. Les plafonds live SQL
  existent mais ne sont pas encore certifiés en charge ; les crédits SMS sont
  nécessairement séparés. Ne pas réactiver les addons unitaires : cela
  réintroduirait un modèle hybride que l'UI ne vend pas.
- **Décisions propriétaire requises** : prix publics définitifs (et HT/TTC),
  essai self-service, périmètre mono-établissement, support/onboarding,
  politique annuelle et changement d'offre. Après ces décisions : lot isolé
  P0 de contrat de parité app/site et de textes/CTA, sans Stripe ni déploiement.

## Proposition Codex — 2026-08-03 : noms ludiques des offres

- Recommandation : **Coup d'envoi**, **Club des habitués**, **Le Grand Jeu**
  et **La Grande Aventure**. Ils gardent la logique produit (acquérir, faire
  revenir, animer, combiner) tout en portant le ton cartoon du site sans
  infantiliser une décision commerciale. Les objectifs restent dans le
  sous-titre, jamais dans le nom seul.
- Alternatives à tester en maquette : « Déclic / La Bande / Le Show / La
  Totale » (plus pop) ; « Ticket d'entrée / Passeport / Scène / Parc complet »
  (univers fête foraine) ; « Première partie / Club / Soirée en jeu / Mode
  légende » (univers jeu). Éviter Starter/Pro/Premium, les noms de modules et
  tout nom qui suggère une promesse de volume ou de support non définie.

## Proposition Codex — 2026-08-03 : add-ons à l'unité et durée

- Noms retenus pour la grille : **Coup d'envoi**, **Le Club**, **Le Grand
  Jeu**, **La Totale**. Un add-on est toujours vendu au-dessus de Coup d'envoi,
  qui porte le QR, la caisse, les lots et les gardes communes : il n'existe pas
  de module isolé sans ce socle.
- **Récurrents mensuels sans engagement** : Passeport des habitués (19 EUR/mois)
  et Bouche-à-oreille / Parrainage (12 EUR/mois). Ils restent actifs jusqu'à la
  fin de la période payée ; pas de durée artificielle pour une mécanique qui
  crée une habitude.
- **Pass candidats, paiement unique** : Chasse au trésor (29 EUR, 30 jours) ;
  Calendrier à surprises (29 EUR, une campagne jusqu'à 31 jours) ; Quiz express
  (15 EUR, 7 jours) ; Cagnotte collective (29 EUR, 30 jours) ; Saison de
  pronostics (39 EUR, 90 jours) ; Soirée en jeu (59 EUR, 7 jours de préparation
  plus le jour J). Les montants sont des hypothèses de lancement à tester, pas
  des prix Stripe décidés.
- Un pass démarre à l'activation de sa campagne, doit être activé dans les 90
  jours suivant l'achat, est attaché à une organisation et à une campagne, et
  met la campagne en pause à l'échéance. Le commerçant conserve ses données et
  ses exports. Aucun essai add-on : l'essai reste celui de Coup d'envoi.
- Lancement recommandé : Passeport mensuel, Chasse 30 jours et Calendrier 31
  jours ; les crédits SMS restent un achat unique sans expiration une fois
  Brevo/STOP/AF2M prêts. Attendre la mesure de capacité avant de vendre Live ou
  Pronostics à l'unité.
- État technique : huit Price IDs add-on existent et le webhook comprend des
  items récurrents, mais aucun checkout client ne les achète aujourd'hui. Les
  pass fixes exigent un registre de droits temporaires, des gardes d'accès qui
  lisent abonnement OU pass, un webhook idempotent, pause à expiration, tests
  multi-tenant et revue sécurité. Aucun Stripe, code ou migration n'est
  autorisé par cette décision seule.

## Décision produit à préparer — 2026-08-03 : pass longs et Soirée en jeu

- **Saison de pronostics** : conserver le prix candidat de 39 EUR, mais pour
  UNE compétition identifiée, depuis son activation jusqu'à sept jours après sa
  finale ou sa clôture, avec un plafond dur de douze mois. Ligue 1 ou Ligue des
  champions ne doivent donc pas être coupées arbitrairement à 90 jours. Le
  droit temporaire doit être lié à un seul `contest_id`, pas à tous les
  championnats de l'organisation.
- **Soirée en jeu** devient l'exception autonome : elle inclut temporairement
  Coup d'envoi + Événements + Quiz, sans abonnement mensuel. Trois jauges
  candidates choisies AVANT paiement et bloquées en base : Petite partie (10
  joueurs, 9 EUR), Soirée (30 joueurs, 19 EUR), Grande tablée (50 joueurs, 29
  EUR). Chaque pass donne sept jours de préparation et vingt-quatre heures de
  jeu, à activer dans les trente jours suivant l'achat. Aucun supplément ou
  facturation rétroactive selon les joueurs réellement présents.
- Les jauges supérieures ne sont pas proposées avant le benchmark live ; Le
  Grand Jeu reste l'offre mensuelle des commerces qui animent régulièrement.
  Le pass doit suspendre la session à l'échéance, garder données/export en
  lecture, et ne jamais prolonger silencieusement un accès. Sa mise en oeuvre
  exige le registre de droits temporaires déjà décrit ; le plafond actuel est
  porté par le plan et ne permet pas encore ces trois jauges commerciales.

## Décision produit — 2026-08-03 : add-ons indépendants du plan principal

- Chaque add-on pourra être acheté sans Coup d'envoi ni autre offre mensuelle.
  Il embarque temporairement les briques communes strictement nécessaires
  (organisation, QR/publication, lot, caisse et gardes) ; le client ne paie pas
  deux fois un socle pour une opération ponctuelle.
- Les mécaniques continues (Passeport des habitués, Bouche-à-oreille) restent
  des abonnements mensuels autonomes et résiliables en fin de période. Les
  mécaniques de campagne ou d'événement sont des achats uniques à durée fixe.
  Une organisation peut cumuler plusieurs droits actifs ; chacun reste borné à
  son module et, lorsqu'il s'agit d'un pass, à sa ressource propre.
- Cette décision change le périmètre d'implémentation : les gardes doivent lire
  un droit actif commun, et non présumer un abonnement principal. Aucun code
  ou Price Stripe n'est créé avant la conception et les tests de ce registre.

## Décision produit à spécifier — 2026-08-03 : tableau de bord ouvert, publication payante

- Tout client voit les neuf modules dans le tableau de bord, avec leurs cas
  d'usage, modèles, tarifs et état d'accès. Il peut préparer UN brouillon par
  module sans publication, afin de comprendre concrètement le produit avant de
  l'acheter. Aucun QR, lien public, écran de salle, participation joueur,
  remise ou campagne active ne peut sortir d'un brouillon non couvert.
- La publication est l'unique geste monétisé : « Publier » ouvre l'achat de
  l'add-on concerné ou l'offre qui le contient ; après confirmation Stripe, le
  brouillon est publié sans ressaisie. Un owner voit et peut acheter ; un editor
  voit le même catalogue mais reçoit « Demander au propriétaire », sans action
  de facturation.
- Contrat de sécurité : séparer `canExplore`, `canEditDraft` et `canPublish`.
  Toutes les Server Actions, routes publiques et RPC qui activent, relancent,
  génèrent un QR/jeton ou acceptent une participation doivent exiger
  `canPublish` sur le droit et la ressource exacts. Une garde d'UI ou de page
  seule ne vaut jamais autorisation. À expiration, toute ressource publiée est
  mise en pause ; brouillons, données et exports restent lisibles.
- Pour limiter l'abus et le stockage : un brouillon non payé par module et par
  organisation, aucune génération de ressource publique avant achat, et
  nettoyage des brouillons inactifs à décider. Mesurer exposition de module,
  brouillon créé, clic publication bloquée, achat initié et première
  publication payante, sans donnée joueur.
- État actuel : les pages-racines non couvertes montrent déjà un upsell, mais
  les pages détail renvoient souvent `notFound()` et les actions vérifient le
  droit global avant les mutations. Ce comportement doit être refactoré dans
  un worktree isolé avec registre de droits temporaires, tests négatifs de
  contournement, revue sécurité, migrations et QA ; aucune publication ne doit
  dépendre d'un état transmis par le navigateur.

### Complément de revue — sécurité et expérience

- Le hub `/dashboard/discover` doit devenir la porte d'entrée universelle aux
  neuf expériences ; conserver une navigation principale courte, limitée aux
  modules publiables, évite neuf liens verrouillés permanents. Chaque carte
  doit afficher exactement l'un des états « Prêt à publier », « Disponible
  dans … » ou « Accès suspendu », selon le même calcul effectif que les gardes
  serveur. Un owner peut acheter ; un editor demande au propriétaire.
- Conserver les contrôles d'exécution existants et les normaliser : activation,
  publication, QR/lien public, session live, caisse, lot, grant ou toute
  mutation qui émet une valeur revalident rôle, organisation, ressource et
  droit effectif côté serveur/RPC. Dépublication, archivage et suppression
  corrective restent ouverts même après expiration.
- **P0 prouvé avant ce chantier** : `comp_access` ne vaut pas tous les
  modules. Or `activeExperienceKinds(..., fullAccess)` et
  `experience-blueprints` traitent actuellement cet accès offert comme un
  accès complet ; Discover peut donc afficher « Actif/Ouvrir » là où une garde
  réelle refuse ensuite. Corriger cette divergence et refuser toute application
  de blueprint sans entitlement exact avant d'ouvrir les brouillons. La
  photographie Stripe vide ne constitue pas un défaut actuel : le résolveur
  sème les droits du plan retenu et le webhook refuse un prix inconnu.
- **P0 structurel** : les tables publiables accordent encore à
  `authenticated` l'écriture directe de `status` sous RLS éditeur ; un POST
  PostgREST peut donc contourner une Server Action qui interdit l'activation
  sans paiement. Les RPC publiques revalident généralement addon + statut et
  limitent l'effet immédiat, mais la promesse commerciale n'est pas tenue par
  construction. Une migration doit ajouter un trigger `SECURITY DEFINER`
  commun qui refuse seulement les transitions vers un état public sans droit
  effectif, tout en autorisant brouillon, pause, archivage et suppression.
  Gardes runtime conservées ; pgTAP de contournement direct sous rôle
  `authenticated`, plus cas payé, résilié et inter-tenant obligatoires.

## Brief Claude Code — lot isolé « découverte, droits et publication payante »

> **Ce brief est la source de vérité pour ce lot.** Il remplace les propositions
> antérieures contradictoires de ce fichier sur les noms, l'indépendance des
> add-ons, les pass et le comportement après paiement. Ne pas modifier le
> chantier Claude déjà en cours ni reprendre ses fichiers : assembler ce lot
> uniquement dans un worktree neuf, puis refaire un scan complet avant toute
> publication.

### Objectif vérifiable

Permettre à tout commerçant de découvrir les neuf jeux et de préparer leurs
brouillons dans le tableau de bord, tout en garantissant **dans la base, dans
les actions serveur et dans les routes/RPC publiques** qu'il ne peut publier,
faire jouer, générer un QR/lien, attribuer une récompense ou activer une
ressource que s'il possède le droit payant effectif pour ce module et cette
ressource. Le bénéfice commerçant est de préparer une animation avant de
l'acheter ; le bénéfice joueur est de ne jamais tomber sur une expérience
incomplète ou impayée publiée par erreur.

Priorité : **P0**, car la garde actuelle uniquement côté action est
contournable par écriture PostgREST directe sur plusieurs statuts. Coût : lot
transversal (données, billing, gardes, UI, tests). Risque principal : casser un
flux historique de publication ou laisser un bypass si le recensement des
ressources est incomplet ; le travail doit donc être incrémental, inventorié et
testé au niveau SQL.

### Décisions produit figées

1. Les offres mensuelles s'appellent exactement : **Coup d'envoi**, **Le
   Club**, **Le Grand Jeu**, **La Totale**. Les objectifs restent affichés en
   sous-titre (lancer / fidéliser / animer / tout réunir), jamais déduits du
   nom seul.
2. **Tous les add-ons sont achetables indépendamment** d'une offre mensuelle.
   Ils embarquent seulement le socle commun nécessaire à leur expérience. Ils
   ne déverrouillent pas les autres modules de l'organisation.
3. Add-ons récurrents autonomes : Passeport des habitués (19 EUR/mois) et
   Bouche-à-oreille / Parrainage (12 EUR/mois). Add-ons campagne ou événement :
   paiement unique, droit borné à leur module et, quand applicable, à une
   ressource précise. Les montants restent des candidats commerciaux : ne créer
   aucun produit ou Price Stripe réel dans ce lot.
4. Saison de pronostics : candidat à 39 EUR pour **une compétition identifiée**
   et un seul `contest_id`, de son activation à sept jours après sa finale ou
   clôture manuelle, avec plafond dur de douze mois. Les données restent
   consultables/exportables trente jours après la fin ; le droit de jouer ne
   continue pas pendant cette archive.
5. Soirée en jeu est un pass autonome qui inclut temporairement les briques
   Coup d'envoi + Événements + Quiz. Candidats à figer seulement après le
   benchmark : Petite partie (10 joueurs, 9 EUR), Soirée (30, 19 EUR), Grande
   tablée (50, 29 EUR), sept jours de préparation puis vingt-quatre heures de
   jeu, activation dans les trente jours. La jauge est choisie avant paiement,
   enregistrée et jamais ajustée/facturée rétroactivement. **Aucune promesse ni
   mise en vente des jauges live avant mesure de capacité.**
6. Le hub `/dashboard/discover` affiche les neuf modules pour tous. Un client
   peut conserver au plus un brouillon non payé par organisation et par module
   (y compris via un blueprint). Aucun QR, URL publique, écran de salle,
   participation, caisse, lot, tirage, gain, remise ou campagne active ne peut
   être émis depuis ce brouillon.
7. States UI contractuels : « Prêt à publier », « Disponible dans … » et
   « Accès suspendu ». Le propriétaire peut acheter ; un éditeur voit le même
   catalogue mais seulement « Demander au propriétaire », jamais un contrôle
   Stripe.
8. Après paiement confirmé par webhook, le brouillon revient **prêt à publier**
   sans ressaisie : la publication reste un clic explicite du commerçant, afin
   de ne pas exposer automatiquement une configuration incomplète. À
   expiration, la ressource est mise en pause/archivée de manière sûre ; les
   données et exports restent lisibles. Désactivation et archivage doivent
   toujours rester possibles sans droit. La suppression reste soumise aux
   invariants propres aux codes, stocks, récompenses et audit : ne pas affaiblir
   ces gardes.
9. `comp_access` reste un accès commercial général borné, **pas** un entitlement
   implicite à tous les jeux, ni un droit de publication live. Son éventuelle
   permission de créer des brouillons doit être explicitement décidée et
   testée ; elle ne doit jamais découler de `fullAccess`.

### Préparation et isolation obligatoires

1. Lire à nouveau `CLAUDE.md`, les états `.claude/state/`, ce handoff et le
   statut Git avant toute modification. Définir dans le compte-rendu le SHA de
   départ réellement utilisé.
2. Ne jamais écrire dans `chantier/derniers-ouverts`, ni modifier les fichiers
   déjà modifiés par l'utilisateur ou un autre agent. Créer un worktree/branche
   isolé depuis un SHA explicitement choisi après assemblage du chantier en
   cours (par exemple `claude/discovery-entitlements`). Aucun cherry-pick ou
   merge implicite.
3. Ne créer ni produit/Price Stripe distant, ni webhook distant, ni migration
   distante, ni commit/push/déploiement sans instruction distincte du
   propriétaire. Les IDs de prix restent côté serveur et les secrets restent
   absents de tout log, fixture et compte-rendu.

### Plan d'implémentation à suivre

#### A. Établir l'inventaire avant de modifier les gardes

Produire dans le PR ou le compte-rendu une matrice par expérience : entitlement
attendu, tables et statuts publiables, action/API/RPC de création, publication,
pause, QR/lien, entrée publique, attribution de gain et tâche d'expiration.
Inclure au minimum Core/campagne, Pronostics, Chasse, Fidélité, Jackpot,
Événements, Calendrier, Parrainage, Quiz et les blueprints.

L'inventaire doit prouver chaque transition vers `active`, `published`, `live`
ou équivalent ; un simple grep du nombre de tables ne suffit pas. Relever les
exceptions existantes : les créations brouillon de Chasse, Fidélité, Jackpot,
Événements, Calendrier et Quiz sont déjà compatibles ; `createContest`
Pronostics bloque encore trop tôt et doit être aligné. L'application d'un
blueprint peut créer un brouillon autorisé par ce contrat, mais jamais marquer
le module « Actif » sans entitlement exact.

#### B. Concevoir un droit effectif unique et auditable

`organization_entitlements` est un snapshot Stripe par `(organization_id,
entitlement, source)` avec `source_reference` et `metadata`, réservé au
`service_role`. Ne pas le détourner à la hâte pour des pass polymorphes. Après
lecture de son schéma et de ses migrations, introduire si nécessaire un registre
complémentaire immuable de grants temporaires, avec au minimum : organisation,
entitlement validé, portée (`organization` ou ressource), type/id de la
ressource, source de paiement/référence Stripe idempotente, début/fin,
configuration commerciale immuable (dont jauge), dates d'activation/de pause
et métadonnées non sensibles.

Les identifiants de ressource polymorphes ne suffisent pas à eux seuls : toute
fonction qui les résout doit vérifier que la ressource appartient bien à
l'organisation et au type de jeu déclaré. Préférer des contraintes/index
uniques sur la référence Stripe et les grants actifs plutôt qu'une confiance
dans une valeur envoyée par le navigateur. Le client ne peut jamais insérer,
modifier ou prolonger un grant.

Créer une fonction SQL interne unique (par exemple
`org_can_publish_experience(p_organization_id, p_entitlement, ...)`) utilisée
par les triggers de statuts. Son prédicat doit refléter exactement l'accès
général courant : abonnement `active`, essai `trialing` non échu, `past_due`
dans la grâce de quatorze jours, ou accès offert encore valide, **puis** le
droit exact du module ; ajouter le grant temporaire à portée correcte lorsque
applicable. Ne pas se contenter du booléen dénormalisé `addon_*`, qui peut
rester vrai après la fin effective de la grâce. La fonction est
`SECURITY DEFINER`, avec `search_path` sûr, droits d'exécution non publics et
tests d'autorisation.

`comp_access` doit être retiré des usages actuels où il devient
`fullAccess` (`activeExperienceKinds`, Discover et application de blueprints).
Le résolveur TypeScript côté serveur et le résolveur SQL doivent partager la
même table de décision ; documenter toute différence impossible à mutualiser
et la couvrir par tests jumeaux.

#### C. Fermer le bypass structurel, sans casser l'exploitation historique

Ajouter une migration avec trigger(s) `BEFORE INSERT OR UPDATE` sur chaque
table dont un statut rend une expérience publique/jouable. Le trigger doit
refuser une transition vers un statut public sans `org_can_publish_experience`.
Il doit laisser passer brouillon, édition de brouillon, pause, archivage et
les opérations de réparation non publiques. Conserver les contrôles actuels
des Server Actions et des RPC publiques : rôle, tenant, ressource, fenêtre
temporelle, stock/règlement et émission de récompense restent des défenses
distinctes.

Ne pas remplacer les RLS par une confiance envers les actions serveur, ni
affaiblir les règles de suppression historiques. Le résultat attendu est qu'un
éditeur authentifié qui appelle PostgREST directement ne puisse pas publier un
jeu impayé, même s'il connaît l'ID de la ligne.

#### D. Checkout et webhooks, sans effet de bord entre produits

Créer un catalogue serveur fermé : un slug produit connu décide du Price ID,
du type (récurrent / paiement unique), de l'entitlement, de la portée, de la
durée et des limites. Le navigateur ne transmet que cet identifiant validé et
l'ID de sa propre ressource brouillon ; il ne décide jamais prix, entitlement,
durée, organisation, jauge ni statut.

- Les add-ons récurrents autonomes sont gérés comme des items d'abonnement
  compatibles avec le contrat Stripe existant.
- Les pass sont des Checkout `mode=payment` : le webhook vérifié crée ou active
  le grant temporaire idempotent, lié à la bonne ressource.
- Un paiement unique ne doit jamais faire muter le statut d'abonnement Core.
  Conserver le traitement spécifique et idempotent déjà nécessaire aux crédits
  SMS ; ne pas le faire passer par une généralisation qui l'abîme.
- Un prix inconnu, metadata incohérente, événement dupliqué, organisation ou
  ressource étrangère est refusé et journalisé sans PII. Ne pas faire confiance
  à une redirection de succès pour accorder le droit.
- À expiration/annulation, une tâche sûre identifie uniquement les ressources
  couvertes et les met en pause. Aucun prolongement silencieux ; aucune pause
  d'un autre jeu de la même organisation.

#### E. Tableau de bord et parcours de découverte

Garder une navigation principale courte, avec Discover toujours visible et les
modules effectivement publiables/actifs seulement. Les pages module ne doivent
plus renvoyer `notFound()` simplement parce qu'il manque l'entitlement : elles
montrent le modèle, le brouillon possible et le CTA adapté, sans exposer de
données publiques d'un autre tenant.

Séparer explicitement `canExplore`, `canEditDraft` et `canPublish` dans le
modèle de vue et dans les actions. L'étiquette de la carte Discover est calculée
par le même résolveur effectif que l'exécution serveur, pas par la visibilité
du menu. Instrumenter sans PII : vue Discover/carte, ouverture d'offre,
démarrage checkout, paiement confirmé, grant activé, premier brouillon et
première publication payante.

#### F. Tests et preuves minimales non négociables

1. Tests unitaires du catalogue fermé, du résolveur de droits et des états UI,
   dont `comp_access` ne donne pas un faux « Prêt à publier ».
2. Tests Stripe/webhook : prix inconnu, metadata falsifiée, duplicat, paiement
   unique, changement/annulation d'abonnement, expiration de pass et isolation
   organisation/ressource. Vérifier que les crédits SMS restent indépendants.
3. pgTAP sous `authenticated` pour **chaque table de publication recensée** :
   tentative PostgREST directe impayée refusée ; payé accepté ; résilié ou
   grâce dépassée refusé ; mauvais tenant/ref de ressource refusé ; pause et
   archivage autorisés. Couvrir aussi `past_due` dans et hors fenêtre de grâce.
4. E2E : owner découvre, crée un brouillon, obtient l'upsell, reçoit un grant
   de test via webhook contrôlé, puis publie explicitement ; la route publique
   fonctionne seulement alors. Editor voit « Demander au propriétaire ».
   Vérifier qu'un pass de compétition ne publie pas un autre contest, que
   l'expiration bloque les nouvelles participations/récompenses mais conserve
   dashboard/export, et qu'aucun QR/lien n'est disponible avant achat.
5. Rejouer les migrations et régénérer/vérifier les types si le dépôt le
   requiert ; exécuter typecheck, lint, tests unitaires, pgTAP, build et E2E
   depuis un environnement local propre avant les gates CI. La capacité live
   n'est pas certifiée par ces tests et ne doit pas être revendiquée.

### Scan final imposé à Claude avant publication

Une fois l'assemblage terminé, refaire une passe **en lecture seule sur le SHA
exact** : diff intégral, recherche de tout accès `status`/publication/public
entry non couvert, revue des privilèges SQL (`SECURITY DEFINER`, `search_path`,
`GRANT EXECUTE`, RLS), tentatives PostgREST directes, parcours public et
webhook simulé. Comparer le résultat à la matrice A ; tout statut/table/route
non cartographié bloque le lot. Vérifier aussi qu'aucun fichier du chantier
Claude initial, secret, Price ID réel, migration distante ou modification
hors-scope n'a été inclus.

Avant toute publication GitHub ou distante : worktree propre hors fichiers
utilisateur, tests consignés avec leurs résultats, risques résiduels explicites
et demande d'accord propriétaire séparée pour commit/push/merge/déploiement ou
migration distante.

## Brief Claude Code — chantier 2 « Tableau de bord guidé et ludique »

> **Dépendance et isolation.** Ce chantier démarre seulement après assemblage
> et scan du lot « découverte, droits et publication payante ». Il est réalisé
> dans un nouveau worktree isolé, jamais dans le chantier en cours ni dans le
> worktree de ce premier lot. Son rôle est de rendre le dashboard simple et
> rassurant ; il ne doit ni modifier les droits, ni contourner les gardes de
> publication, ni créer de produits Stripe.

### Problème prouvé et résultat attendu

Le dashboard contient déjà une checklist de démarrage pour la première roue et
un hub `/dashboard/discover` pour les neuf expériences, mais le client arrive
ensuite dans des éditeurs séparés, avec des formulaires et des états différents.
Il doit deviner l'ordre de création, ce qui favorise l'abandon ou une campagne
incomplète. La navigation ne montre par ailleurs que les modules actifs : le
catalogue est donc découvert à part, plutôt que comme une continuité du geste
« je veux créer une animation ».

Le résultat à livrer est un dashboard où un owner ou editor sait toujours :
**où il en est, quelle est la prochaine petite action utile, pourquoi elle est
nécessaire, et comment revenir plus tard sans rien perdre.** Le ton est
cartoon, chaleureux et dynamique, mais reste professionnel : une « mission »
et une progression visible, jamais un jeu infantilisant, un score artificiel
ou une visite forcée.

Priorité : **P1 après la sécurité des droits**. Bénéfice commerçant : première
animation publiée plus vite et moins d'erreurs ; bénéfice joueur : expériences
plus cohérentes et testées avant leur première diffusion. Coût : transversal
frontend + persistance légère + tests E2E. Risque : ajouter un tour générique
qui cache l'interface ou contredit un droit/état réel ; l'assistant doit donc
être contextuel, annulable et strictement informatif.

### Parcours produit à implémenter

La porte d'entrée principale devient une carte claire : **« Créer une
animation »**. Elle ouvre le hub Découvrir, puis un parcours commun :

`Objectif → Jeu / modèle → Les essentiels → Récompense et règles → Aperçu et
test → Publication`

1. **Objectif.** Proposer en mots simples : attirer de nouveaux clients,
   fidéliser, animer un moment, créer du trafic. Le client peut aussi choisir
   directement un jeu s'il sait déjà lequel il veut.
2. **Jeu et modèle.** Chaque carte explique le bénéfice, le temps approximatif
   de préparation et ce que vivra le joueur. Les modèles ne sont pas de la
   décoration : ils préremplissent seulement un brouillon révisable. Une carte
   sans droit exact explique l'offre/add-on minimal ; owner = CTA contextualisé,
   editor = « Demander au propriétaire ».
3. **Les essentiels.** Un assistant affiche seulement 3 à 5 décisions qui
   rendent cette expérience jouable (nom/date ou durée, mécanique, lot/règle,
   diffusion selon le jeu). Les réglages avancés sont repliés sous « Personnaliser
   plus tard », sans supprimer les validations métier.
4. **Récompense et règles.** Expliquer la conséquence de chaque choix juste au
   moment utile : stock, probabilité, nombre de gagnants, échéance, règles de
   participation. Les informations sensibles ou irréversibles demandent une
   confirmation explicite, pas une simple bulle.
5. **Aperçu et test.** Avant publication, montrer une fiche « prête pour les
   joueurs ? » avec les prérequis réels, le preview adapté au jeu et le test
   quand il existe. Une étape non finie explique précisément l'action suivante,
   sans inventer un feu vert.
6. **Publication.** Déléguer entièrement l'autorisation au lot de droits : le
   guide peut mener à l'upsell ou au bouton de publication, mais ne décide
   jamais qu'une ressource est publiable. Après publication, la mission devient
   une carte de suivi (partager QR, suivre les premières participations,
   remettre les gains) plutôt qu'un tunnel disparu.

### Règles d'expérience non négociables

- Une seule « prochaine action » prioritaire sur l'accueil, déterminée par
  l'état réel de l'organisation et de sa dernière expérience en brouillon. Le
  client peut choisir « Voir toutes mes animations » ou « Créer autrement ».
- Une progression par expérience, persistante et lisible : par exemple
  « 2 étapes sur 5 — brouillon enregistré ». Ne jamais remettre à zéro une
  mission parce qu'un client a quitté ou changé d'appareil.
- Des bulles contextuelles très courtes, ancrées à l'élément concerné, avec
  « Compris »/fermeture, accessibles au clavier et sans bloquer le clic. Elles
  expliquent une décision ou un risque ; elles ne répètent pas le libellé d'un
  bouton. Prévoir `prefers-reduced-motion`, focus visible, lecteur d'écran et
  petit écran.
- Pas de carrousel de tutoriel automatique, de modal plein écran obligatoire,
  de confettis répétés, ni de jargon (« funnel », « entitlement », « activation
  technique ») dans l'espace commerçant. Une petite célébration accessible à la
  première publication réelle est acceptable, puis ne se répète plus.
- Owner et editor suivent la même mission pour travailler ensemble, mais les
  actions réservées au owner sont clairement attribuées (« À faire par le
  propriétaire »), sans lien mort ni redirection muette. Cashier conserve son
  parcours caisse, sans assistant de création.
- Tous les libellés d'état proviennent de la même source que le dashboard :
  « Prêt à publier », « Disponible dans … », « Accès suspendu ». Le guide ne
  masque jamais la conservation des données lors d'une suspension.

### Architecture recommandée, sans duplication par jeu

1. Introduire un petit contrat de parcours, séparé du rendu, par exemple une
   entrée `ExperienceJourney` reliée à `EXPERIENCE_CATALOG`. Elle décrit pour
   chaque kind : objectif, texte de bénéfice, modèle(s), prérequis ordonnés,
   liens/actions, état de brouillon/publication et aide contextuelle. Ne pas
   éparpiller neuf checklists codées dans les pages.
2. Réutiliser un composant de mission (carte d'accueil), un rail de progression,
   un panneau « Pourquoi cette étape ? », une fiche de validation et des
   coach-marks accessibles. Les éditeurs existants gardent leurs validations et
   leurs actions ; le guide les encadre, il ne les duplique pas.
3. Distinguer deux persistances :
   - l'état **métier partagé par organisation/ressource** (brouillon, étapes
     objectivement remplies, publication) calculé depuis les vraies données ;
   - les préférences **personnelles** (bulle déjà fermée, aide réduite), liées
     à l'utilisateur et protégées RLS. Ne pas stocker ces préférences seulement
     dans le navigateur, sinon elles se perdent ou se partagent entre collègues.
4. Avant toute nouvelle table, vérifier si les données existantes permettent de
   calculer l'étape. Ne persister que les préférences et les états qui ne sont
   pas déductibles. Les états de droit et de publication restent exclusivement
   ceux du premier lot ; aucune nouvelle colonne « actif » approximative.
5. Prévoir un fallback propre sans JavaScript : formulaires et création restent
   utilisables, les indications progressives s'enrichissent côté client sans
   devenir le seul chemin.

### Séquence de réalisation

1. **Mesure et inventaire (lecture seule).** Cartographier pour les neuf jeux
   les prérequis réellement contrôlés par chaque éditeur, les modèles existants,
   les écrans preview/test/publication et les différences owner/editor. Relever
   les formulations incompréhensibles et les liens qui aboutissent sur une page
   non autorisée. Écrire la matrice avant de dessiner le guide.
2. **Fondation.** Créer le contrat de parcours et les composants communs ;
   transformer la checklist de première roue en mission générique sans perdre
   les comportements utiles actuels (notamment le retrait des actions owner-only
   pour un editor). Ajouter l'état « reprendre mon brouillon » à l'accueil.
3. **Pilote complet.** Appliquer le parcours de bout en bout à Coup d'envoi /
   campagne, car il couvre lots, QR, affiche, test et publication. Faire tester
   le parcours sur mobile et ordinateur avec un compte owner et editor.
4. **Généralisation.** Brancher les huit autres jeux à la même architecture,
   en conservant leurs règles spécifiques : compétition, chasse multi-QR,
   fidélité/caisse, jackpot, événement live, calendrier, parrainage et quiz.
   Toute exception doit apparaître dans le contrat, pas dans un texte ad hoc.
5. **Finition et instrumentation.** Ajouter une microcopy cohérente, les aides
   contextuelles limitées et les événements anonymes : mission affichée,
   étape commencée/terminée, aide ouverte/fermée, modèle choisi, brouillon
   repris, preview/test, publication. Mesurer le parcours
   découverte → brouillon → prérequis remplis → première publication, segmenté
   owner/editor et état d'accès, jamais par donnée joueur.

### Tests et scan final

- Tests unitaires du calcul de prochaine étape, des étapes visibles selon rôle,
  de l'ordre des prérequis et des états de droit. Une bulle fermée par un
  utilisateur ne doit pas disparaître chez son collègue.
- Tests de composants : clavier, focus, lecteur d'écran, réduction de mouvement,
  petites largeurs, fermeture/reprise et aucun CTA owner-only pour un editor.
- E2E owner : créer une première animation, quitter à mi-parcours, reprendre,
  configurer, prévisualiser/tester puis publier avec droit valide. E2E editor :
  même découverte et préparation, demande claire au owner pour le geste réservé.
  E2E droit suspendu/non payé : brouillon visible mais aucune publication,
  QR/public URL ou promesse trompeuse.
- Refaire avant publication un scan du diff sur les routes/actions : le guide
  n'a pas introduit un appel client qui change rôle, organisation, droit,
  ressource, prix ou statut. Vérifier que chaque lien du guide atteint une page
  réellement accessible au rôle concerné.
- Exécuter les validations applicables depuis un environnement propre :
  typecheck, lint, tests unitaires ciblés puis complets, build et E2E. Si une
  migration de préférences a été retenue : replay/seed/pgTAP et vérification
  des policies RLS. Consigner les commandes et résultats ; pas de publication
  sans revue de l'arbre propre et accord propriétaire.

## Proposition produit — IA utile dans le dashboard, jamais gadget

### Décision de positionnement recommandée

Intégrer l'IA comme un **« Coup de pouce créatif »** au sein du parcours guidé,
et non comme un chatbot permanent. L'IA part des choix structurés du
commerçant, propose un contenu ou une prochaine action, puis le commerçant
relit, modifie et valide. Elle ne possède aucun bouton de publication, de
facturation, d'attribution de lot ou de modification irréversible.

Le bénéfice est concret : un commerçant qui ne sait pas quoi écrire ou quel jeu
choisir démarre une animation crédible en quelques minutes ; le joueur obtient
une consigne claire et cohérente avec l'animation. Priorité : **P2 après le
parcours guidé**, car une IA ne doit pas compenser une interface confuse. Coût :
une intégration serveur, des limites de coût et de sécurité, des évaluations de
qualité et une UX d'acceptation/édition. Risque : contenu faux, mal adapté ou
trop coûteux si l'IA agit sans validation ; les règles suivantes le limitent.

### Les quatre usages à construire, dans cet ordre

1. **Choisir le bon jeu.** Dans « Créer une animation », le commerçant répond à
   quatre questions courtes (objectif, type de commerce, occasion, durée). Le
   système propose deux ou trois jeux/modèles avec le pourquoi. Un moteur de
   règles déterministe filtre d'abord les expériences compatibles ; l'IA ne
   rédige que l'explication et adapte le ton. Ainsi aucun modèle ne recommande
   une expérience non accessible, trop longue ou non mesurée en capacité.
2. **Remplir la page blanche.** Dans chaque étape de création, bouton discret
   « Donne-moi une idée » : générer trois variantes éditables de titre, accroche
   QR, description de lot, message de participation, affiche courte ou
   consigne. Pour Quiz : proposer un lot de questions à partir d'un thème,
   niveau et public, que le commerçant valide individuellement avant insertion.
   Pour Chasse : indices et fil conducteur ; pour Calendrier : idées de jours ;
   pour une campagne : texte et mécanique de lancement. Aucun contenu n'est
   enregistré tant que le client n'a pas cliqué « Utiliser cette idée ».
3. **Coach de configuration.** Sur le rail de mission, « Que manque-t-il ? »
   transforme les prérequis déjà calculés par le produit en une explication
   simple : par exemple « ajoutez un lot disponible avant de tester ». Les
   contrôles de stock, durée, règles, consentement et publication restent
   déterministes ; l'IA les explique mais ne les décide jamais.
4. **Bilan après lancement, plus tard.** Une fois assez de données propres,
   proposer un résumé de la seule organisation : ce qui a été joué, ce qui a
   été remis et une suggestion d'action suivante. Ce n'est ni une promesse de
   ROI, ni une comparaison avec d'autres commerces, ni une décision
   automatisée. Ce quatrième usage attend la stabilisation des analytics et de
   l'identité/récompenses universelles.

### Où l'IA apparaît dans l'interface

- Dans Discover : après le choix d'objectif, « Aidez-moi à choisir » ouvre les
  quatre questions et retourne des cartes de jeux, jamais une réponse libre
  opaque.
- Dans l'assistant de création : à droite d'un champ textuel vide et dans le
  choix de modèle, sous forme de trois propositions courtes, visibles et
  modifiables.
- Dans l'étape de contrôle avant publication : « Expliquer les points à
  finaliser », avec la liste réelle des prérequis au-dessus ; pas de faux
  diagnostic généré.
- Dans la page de suivi : une seule carte « Le prochain petit geste », masquée
  tant qu'il n'existe pas de donnée métier suffisante. Pas de chat-bulle qui
  poursuit le commerçant sur toutes les pages.

### Contrat de sécurité, données et coût

1. Toutes les requêtes IA partent d'une route/action serveur authentifiée,
   organisation et rôle revalidés. Le navigateur ne choisit ni modèle, ni
   prompt système, ni plafond, ni données d'une autre organisation.
2. Ne transmettre par défaut **aucune donnée joueur**, email, téléphone,
   identifiant, code de gain, secret, prix Stripe ou contenu de conversations.
   Les prompts utilisent les choix explicitement fournis et des agrégats de
   l'organisation ; la minimisation et la conservation du fournisseur doivent
   être documentées avant activation commerciale.
3. Exiger une sortie structurée validée côté serveur (schéma et bornes de
   longueur), traiter toute sortie comme du texte non fiable et ne jamais
   exécuter un lien, HTML, SQL ou instruction retournés par le modèle. Les
   contenus importés/externe ne peuvent jamais modifier les instructions du
   système.
4. Chaque suggestion demande une approbation humaine explicite. L'IA ne crée,
   n'active, n'envoie, ne publie, ne tire, ne remet et ne dépense rien seule.
   Les refus déterministes existants restent la vérité.
5. Mettre un quota par organisation et par période, une limite de taille et de
   temps, une protection anti-rafale, un suivi de coût agrégé et des messages
   clairs lorsque le quota est atteint. Aucun coût ne doit être caché dans une
   offre sans décision commerciale séparée.
6. Ajouter un filtrage de sécurité et une voie de signalement/« Régénérer » ;
   prévenir le commerçant qu'il demeure responsable de relire les textes,
   notamment sur les lots, les conditions et les données personnelles. L'IA ne
   rédige pas de règlement juridique et n'invente pas de conformité.

### Premier lot IA conseillé (MVP)

Ne lancer que « Aidez-moi à choisir » + « Donne-moi trois idées » pour Coup
d'envoi, Quiz, Chasse et Calendrier. C'est le meilleur rapport valeur/risque :
le résultat est immédiatement visible, toujours éditable et ne touche pas les
flux de jeu ou de paiement. Prévoir des jeux d'évaluation français par type de
commerce, des tests de refus (prompt hostile, donnée d'un autre tenant, sortie
hors schéma), des tests de quota/idempotence et une revue sécurité dédiée avant
la première mise en ligne. Les suggestions de bilan analytique viennent ensuite,
après mesure de leur pertinence sur des pilotes réels.

### Procédé imposé à Claude pour le lot IA MVP

Créer ce lot **après** le chantier dashboard guidé, dans son propre worktree et
en gardant le produit fournisseur interchangeable. Ne pas commencer par une
fenêtre de chat ni une base vectorielle : elles n'apportent aucune valeur prouvée
au premier parcours et augmentent la surface de fuite/prompt injection.

1. Écrire d'abord un `ai-assist-catalog` fermé : cas d'usage autorisés,
   champs d'entrée minimaux, rôle requis, limites, type de sortie et messages
   de refus. Un slug tel que `choose_experience`, `campaign_copy`,
   `quiz_questions`, `hunt_clues` ou `calendar_ideas` est choisi côté serveur ;
   aucun prompt libre ne part du navigateur.
2. Placer derrière une seule interface serveur le fournisseur IA et son modèle.
   Les pages/actions ne connaissent qu'une méthode métier typée. La clé API
   reste exclusivement serveur, le timeout et le nombre maximal de tentatives
   sont bornés, et un fournisseur indisponible retourne une aide classique sans
   empêcher la création manuelle.
3. Construire les prompts à partir de gabarits versionnés dans le dépôt et de
   données minimisées : secteur volontairement choisi, objectif, occasion,
   ton, contraintes de l'expérience. Exclure par construction données joueur,
   secrets, IDs, prix Stripe, texte libre non nécessaire et informations d'une
   autre organisation.
4. Imposer une réponse JSON à schéma fermé, valider Zod côté serveur, borner
   chaque texte et écarter toute sortie invalide. Afficher jusqu'à trois cartes
   de proposition ; « Utiliser cette idée » copie seulement le texte dans le
   formulaire local. Aucune écriture de brouillon ni appel de publication ne
   découle de la réponse IA elle-même.
5. Stocker uniquement une télémétrie technique et commerciale minimisée : cas
   d'usage, organisation hachée/pseudonymisée si possible, volume, latence,
   succès/refus/coût et version de prompt. Ne pas conserver le prompt ou la
   réponse brute par défaut ; toute conservation de diagnostic doit être
   explicitement justifiée, limitée et documentée.
6. Ajouter un budget par organisation et jour/mois, une clé d'idempotence par
   demande, un rate-limit, un plafond de taille et un coupe-circuit global. Le
   dashboard affiche « Suggestions temporairement indisponibles » plutôt que de
   masquer ou de bloquer l'éditeur.
7. Tester le contrat avant les écrans : organisation/role étrangers refusés,
   aucune donnée interdite dans le payload, sortie invalide refusée, quota et
   idempotence, timeout/fournisseur en panne, suggestion acceptée mais non
   publiée. Ajouter ensuite les E2E du chemin owner et editor, puis un scan
   sécurité final du diff et des logs avant toute publication.

Critères de sortie : le commerçant peut toujours créer son animation sans IA ;
l'IA propose au plus trois idées utiles, en français, modifiables ; aucun droit,
statut public, paiement, lot ou donnée joueur n'est affecté ; les coûts sont
mesurables et plafonnés. Le choix final du fournisseur, du modèle, des quotas
et d'une éventuelle facturation IA reste une décision propriétaire distincte,
après revue des conditions de données et des prix alors en vigueur.

## Proposition suivante — « Mode Répétition » avant publication

### Pourquoi c'est la meilleure amélioration suivante

Après le guide et le Coup de pouce créatif, le commerçant doit pouvoir vérifier
son animation sans stress. Certains modules possèdent déjà des aperçus ou tests,
mais ils sont dispersés et ne donnent pas une réponse commune à la question :
« Est-ce que mon client vivra bien ce que j'ai prévu ? ».

Le **Mode Répétition** est une prévisualisation privée où le commerçant suit
l'expérience comme un joueur, puis reçoit une fiche de contrôle claire. C'est
plus utile qu'une nouvelle statistique ou un chat : il évite une publication
incomplète, donne confiance à un premier utilisateur et améliore directement
le parcours joueur. Priorité : **P2, après le dashboard guidé et avant les
conseils IA post-lancement**. Coût : moyen, car les neuf expériences n'ont pas
le même cycle de jeu. Risque : confondre essai et vraie participation ; la
répétition doit être techniquement isolée.

### Parcours attendu

`Brouillon → Lancer la répétition → Jouer comme un client → Vérifier → Corriger
ou publier`

- Depuis la dernière étape de la mission, bouton « Faire une répétition ».
- Une bannière persistante « Mode répétition — rien n'est visible par vos
  clients » distingue sans ambiguïté cet environnement du vrai jeu.
- Le commerçant peut tester QR/lien privé, les écrans joueur et les règles
  essentielles. Les simulations n'entrent jamais dans les analytics réels, les
  stocks, les tirages, les récompenses, le classement, les emails/SMS ni la
  caisse.
- À la sortie, une fiche déterministe affiche les prérequis satisfaits et ce
  qui reste à compléter : lot jouable, créneau, QR, règle, information joueur,
  droit de publication. Le Coup de pouce IA peut reformuler les conseils, pas
  inventer les contrôles.
- Si tout est prêt, le CTA « Publier mon animation » reste soumis au résolveur
  de droits et à la confirmation explicite déjà définis. Sinon, un seul lien
  mène vers l'étape réellement manquante.

### Contraintes d'implémentation pour Claude

Ne pas cloner des tables publiques ni marquer une vraie participation comme
« test ». Définir une interface de simulation par expérience, strictement
privée et org-scopée, avec un acteur de test séparé et une protection
serveur/RPC. Réutiliser les mappers et le rendu joueur lorsque c'est sûr, mais
remplacer toute émission de valeur par un résultat fictif explicite. Les règles
de stock, chance, échéance, identité, gain et remise doivent avoir des tests
négatifs dédiés prouvant qu'une répétition ne peut pas les modifier.

Commencer par Coup d'envoi, dont le preview existe déjà partiellement, puis
ajouter les modules au contrat commun. Tester owner/editor, brouillon/non payé,
ressource inter-tenant, sortie de répétition et absence de toute écriture de
participation/récompense/analytics réel. Faire une revue sécurité spécifique
des routes de test avant publication.

### Suite cohérente, une fois ce mode validé

1. **Calendrier d'animations** : vue simple « à préparer / à lancer / en cours
   / à clôturer », avec rappels explicables, sans promettre une automatisation
   cachée.
2. **Relancer une formule qui marche** : dupliquer une animation terminée dans
   un nouveau brouillon, avec les lots, dates, QR et contenus à revalider ; ne
   jamais recopier une récompense déjà émise ou une donnée joueur.
3. **Répartition équipe** : cartes « à faire par le propriétaire / l'éditeur /
   la caisse », pour qu'une animation ne reste pas bloquée quand plusieurs
   personnes préparent le commerce.

## Backlog UX ludique après le Mode Répétition

Ces améliorations prolongent le même principe : donner un prochain geste simple
et rassurant, pas ajouter des écrans ou des métriques pour elles-mêmes. Les
traiter une par une dans des worktrees séparés, après mesure de la valeur du lot
précédent.

### P1 — Kit de lancement

Après une répétition validée ou une publication, afficher une mission courte
« Faites connaître votre animation » : QR prêt à imprimer, affiche adaptée,
texte court à copier pour réseaux sociaux, message à l'équipe/caisse et rappel
de la première action à faire en magasin. Le client coche les éléments qu'il a
réellement réalisés, puis voit « Votre lancement est prêt ».

**Valeur :** réduit le moment où une bonne animation reste invisible faute de
diffusion. **IA :** peut proposer trois accroches à partir du jeu déjà créé,
jamais poster ou envoyer à la place du commerçant. **Risque :** ne pas prétendre
qu'un message a été publié ou distribué ; les coches restent déclaratives et
facultatives.

### P1 — Prochaine meilleure action, sans tableau de bord surchargé

Sur l'accueil, remplacer la longue liste d'options par une carte unique qui
change selon l'état réel : « terminer votre brouillon », « faire une répétition
», « afficher votre QR », « préparer le prochain rendez-vous » ou « remettre
les gains en attente ». Les données détaillées restent accessibles, mais ne
passent pas avant l'action utile.

**Valeur :** un nouveau commerçant ne se perd plus et un commerce actif revient
avec un objectif clair. **Risque :** une recommandation erronée peut frustrer ;
la priorisation doit être déterministe, explicable et toujours contournable par
« Voir tout ».

### P2 — Relance saisonnière en un brouillon sûr

À la fin d'une animation, proposer « Rejouer cette formule » : cloner sa
configuration dans un nouveau brouillon, demander ce qui doit changer (dates,
lots, texte, visuel), puis faire passer la répétition. Une frise simple montre
les animations passées, en cours et à venir.

**Valeur :** permet à un commerce de reproduire rapidement Noël, soldes,
anniversaire ou match sans repartir d'une page blanche. **Risque :** ne jamais
copier participations, gagnants, codes, stocks consommés, liens publics ou
données joueur ; tout est réinitialisé et revalidé.

### P2 — Tableau d'équipe « le relais »

Quand owner, editor et caisse coexistent, présenter des cartes d'action qui
nomment le bon rôle : propriétaire (acheter/publier), éditeur (préparer/tester),
caisse (remettre). Chaque carte est reliée à une action autorisée ; aucune
notification ou délégation extérieure n'est envoyée sans choix explicite.

**Valeur :** une animation ne reste pas bloquée parce que personne ne sait qui
doit agir. **Risque :** ne jamais exposer un réglage owner-only à un editor, ni
considérer la carte comme une autorisation.

### P3 — Mini-retour joueur, exploitable et volontaire

Après une expérience, proposer éventuellement une question anonyme et non
bloquante (« Facile à comprendre ? », « Vous avez aimé ? ») avec possibilité de
passer. Le commerçant reçoit une tendance seulement au-delà d'un seuil de
réponses, pas un commentaire public non modéré.

**Valeur :** détecte une consigne confuse avant de perdre des participants.
**Risque :** données personnelles et modération ; commencer sans texte libre,
sans profilage et avec un examen RGPD/anti-abus avant tout déploiement.

### Décision propriétaire — backlog UX retenu uniquement

Le propriétaire retient, pour les chantiers ultérieurs, **uniquement** les deux
améliorations suivantes :

1. **Relancer une formule** : repartir d'une animation réussie dans un nouveau
   brouillon sûr pour Noël, soldes, match, anniversaire ou toute nouvelle
   occasion. Ne jamais recopier participants, gagnants, codes, stocks consommés,
   liens publics ou données joueur ; dates, lots, contenus et diffusion sont
   revalidés avant toute répétition/publication.
2. **Tableau d'équipe** : attribuer visuellement les actions au propriétaire,
   à l'éditeur ou à la caisse, avec seulement des liens vers les actions que ce
   rôle peut réellement effectuer. Les cartes n'accordent jamais un droit et ne
   déclenchent aucune notification externe sans décision explicite.

Le Kit de lancement, la « prochaine meilleure action » et le mini-retour joueur
restent des pistes non approuvées : ne pas les inclure dans un chantier, un
commit ou une maquette sans nouvelle demande du propriétaire.

## Pistes produit, jeu et direction visuelle — non approuvées

### Produit recommandé : Passeport des découvertes

Au lieu d'ajouter un onzième jeu isolé, mettre en scène la méta-progression
déjà présente sous la forme d'un **passeport à collectionner** : à chaque
animation ou visite éligible, le joueur reçoit un tampon/fragment visuel ; une
collection complète ouvre une récompense ou une finale explicitement définie.
Le commerçant choisit une collection saisonnière (par exemple « Les 5 saveurs
de l'été »), voit sa progression et peut relancer une formule sans repartir de
zéro.

**Hypothèse à valider :** un objectif collectionnable rend les visites
successives plus compréhensibles qu'une suite de jeux indépendants. **Bénéfice :**
fidélisation et identité cartoon forte, en réutilisant identité joueur,
récompenses et analytics existants. **Risque/coût :** moyen : ne pas créer une
nouvelle identité ou un nouveau registre de lots ; mesurer retour après une
première collection pilote avant de la vendre comme une promesse de fréquence.

### Jeu candidat : Bingo de quartier

Une carte 3 × 3 d'actions simples, à cocher au fil de visites ou d'une semaine
(scanner un QR, trouver un indice, répondre à une question, découvrir un
produit). Une ligne complète déclenche une récompense déjà gérée par le socle.
Il fonctionne pour un commerce seul, un centre commercial ou un événement,
sans nécessiter une salle live simultanée.

**Bénéfice :** mécanique immédiatement comprise, sociale et très visuelle.
**Risque/coût :** élevé si elle recrée Chasse, Calendrier, Quiz et Fidélité.
Avant tout nouveau module, prouver qu'elle peut être un blueprint composé des
expériences existantes ; ne construire un moteur spécifique que si ce prototype
ne suffit pas. Aucune promesse de jeu multi-enseigne ou de capacité live sans
audit séparé.

### Apparence recommandée : Carte de l'Aventure

Donner au dashboard une colonne vertébrale visuelle : une petite carte cartoon
où chaque animation est une étape (idée, brouillon, répétition, en cours,
clôturée) avec fanions, tampons et un personnage-guide discret. Elle remplace
les indicateurs abstraits par une progression lisible, tout en gardant textes,
statuts et actions accessibles hors de l'illustration.

**Bénéfice :** le commerçant comprend son parcours d'un regard et le site gagne
une signature mémorable. **Risque/coût :** moyen : l'illustration ne doit jamais
être l'unique porte d'accès, surcharger le mobile ni animer sans respecter
`prefers-reduced-motion`. Commencer par la carte de mission de l'accueil, puis
étendre seulement si les tests utilisateurs montrent qu'elle accélère la
première publication.

### Décision propriétaire — direction visuelle retenue uniquement

Le propriétaire retient **uniquement la Carte de l'Aventure** : une carte
cartoon sur l'accueil qui représente l'état réel de chaque animation — idée,
brouillon, répétition, en cours, clôturée — avec fanions et tampons. Elle rend
la progression lisible sans jamais remplacer les vrais boutons, les textes,
les statuts ou les actions accessibles.

Exigences de réalisation : information également disponible sous forme de
liste/texte, navigation clavier et lecteur d'écran complète, mobile d'abord,
animations désactivables via `prefers-reduced-motion`, aucun faux statut ni
action dessinée sans lien autorisé. La première version se limite à la carte de
mission de l'accueil et est mesurée sur la reprise de brouillon et la première
publication.

Le Passeport des découvertes et le Bingo de quartier restent des pistes non
approuvées : ne pas les inclure dans un chantier, une maquette ou un commit sans
nouvelle demande explicite du propriétaire.

## Jeu candidat — déduction sociale live, inspirée du principe « loup-garou »

### Décision de cadrage : possible, mais pas un simple mini-jeu

Le concept est pertinent pour bars, soirées, associations et événements : rôles
secrets, alternance de phases privées et publiques, discussion réelle dans la
salle puis vote sur téléphone. Il doit être intégré à **Soirée en jeu / Le
Grand Jeu**, comme une expérience live autonome, et non ajouté au catalogue
comme un onzième module isolé. Il réutilise QR d'entrée, session live,
identité joueur, écran organisateur, minuteurs, analytics et récompenses déjà
communs.

Le titre et l'univers « Les Loups-Garous de Thiercelieux » correspondent à une
gamme commerciale existante. Ne pas reprendre ce nom, ses personnages, ses
règles détaillées, son texte ou ses visuels sans licence et revue juridique.
Créer une mécanique et un univers originaux, par exemple **« La Nuit des
Masques »**, avec factions et vocabulaire propres. Une vérification juridique
formelle reste nécessaire avant commercialisation sous un nom choisi.

### Pourquoi le lot est plus complexe

Ce jeu ne se limite pas à afficher des questions : il doit garantir le secret
des rôles, les décisions synchronisées, un seul vote par joueur, les minuteries
serveur, l'ordre des phases, les déconnexions et la fin cohérente de partie.
Une fuite de rôle ou une double action détruit la partie ; une simple UI
client-side ou des mises à jour Realtime sans relecture serveur ne suffisent
pas. La capacité live n'étant pas encore certifiée, aucune jauge commerciale
supérieure ne peut être annoncée avant benchmark dédié.

### V1 recommandée : « La Nuit des Masques »

- Une partie privée créée par un organisateur, avec QR/code de salle et un seul
  écran organisateur facultatif. Les joueurs rejoignent sur leur téléphone.
- Effectif et durée configurables dans des bornes prudentes à définir après
  benchmark ; lancer une V1 avec peu de rôles et sans promesse de très grande
  salle.
- Trois rôles originaux seulement : faction cachée, habitants et un rôle de
  soutien simple. La distribution est serveur, aléatoire et immuable après le
  lancement.
- Boucle claire : rejoindre → rôle secret → nuit (actions privées) → annonce
  publique → discussion dans la vraie salle → vote secret sur téléphone →
  résolution serveur → fin de partie. Pas de chat public dans la V1 : il ajoute
  modération, harcèlement et coût sans améliorer la soirée en présentiel.
- Pas de récompense à valeur monétaire dans la première version. Afficher un
  podium/trophée ludique ; brancher les récompenses universelles seulement
  après validation de l'équité et de l'anti-abus.

### Contrat technique et sécurité pour un futur brief Claude

1. Modéliser une machine d'états serveur stricte (`lobby`, `role_assignment`,
   `night`, `discussion`, `vote`, `resolution`, `finished`, `cancelled`) avec
   transitions atomiques, horloge serveur et verrouillage contre double-clic/
   double-vote. Toute phase non attendue est refusée.
2. Séparer les vues par audience : organisateur, joueur lui-même, salle
   publique. Une action/service-role vérifie systématiquement `session_id`,
   `organization_id`, identité joueur et appartenance à la session ; aucune
   requête publique ne doit pouvoir sélectionner la liste complète des rôles ou
   des votes individuels avant résolution.
3. Les messages Realtime n'annoncent qu'une invalidation ou un état public ; le
   client recharge une vue serveur filtrée. Prévoir un fallback de polling
   adaptatif et une reprise après rafraîchissement/déconnexion sans révéler de
   secret.
4. Prévoir l'abandon : délai de lobby, joueur absent, organisateur qui quitte,
   annulation sûre, archivage et données minimales. Aucun minuteur contrôlé par
   le navigateur, aucune résolution entièrement automatique fondée sur une
   donnée client.
5. Tests obligatoires : secret de rôle inter-joueur, multi-tenant, double vote,
   course de résolution, action hors phase, reconnexion, identité expirée et
   annulation ; puis E2E d'une partie complète et test de charge live séparé
   avant toute promesse commerciale de joueurs simultanés.

Statut : **piste produit non approuvée pour implémentation**. Faire d'abord une
maquette/test de règles avec quelques commerces pilotes ; n'ouvrir un chantier
code que si le jeu crée réellement une animation que les modules Live, Quiz et
Pronostics existants ne couvrent pas déjà.

## Décision produit confirmée — QR code pour toute expérience jouable

Toute expérience **publiable et destinée à un joueur** doit disposer, depuis sa
propre page dashboard, d'un QR code prêt à afficher, télécharger ou imprimer.
Un lien public peut rester disponible pour le partage, mais ne doit jamais être
le seul moyen d'entrer dans un jeu. Cette règle couvre Coup d'envoi/campagnes,
Pronostics, Chasse, Fidélité, Jackpot, Événements, Calendrier, Parrainage, Quiz
et tout futur jeu tel que La Nuit des Masques.

Ne pas confondre ce besoin avec les liens internes de dashboard, caisse,
organisateur ou écran de salle : seuls les parcours joueur reçoivent un QR
public. Un QR ne donne aucun droit supplémentaire ; scanner conduit toujours à
la même garde publique tenant/ressource/statut/droit effectif que l'URL
canonique.

### État vérifié avant le lot

Le socle `qr_codes` et ses affiches sont aujourd'hui centrés sur les campagnes
(`createQrCode` ne reçoit qu'un `campaign_id`). Les Chasses possèdent déjà un QR
par étape et les Événements un QR de lobby. À l'inverse, les Pronostics affichent
un lien à copier (`ContestShareLink`) en invitant le commerçant à en faire un QR
hors produit ; Quiz, Jackpot et Calendrier exposent leur chemin public dans
leurs pages, sans outil commun de QR/impression. L'inventaire complet doit
confirmer Fidélité et Parrainage avant toute migration : ne pas déduire leur
comportement depuis un slug.

### Meilleur procédé pour Claude

1. Commencer en lecture seule par une matrice des neuf expériences : ressource
   jouable, URL publique canonique, état de publication, QR déjà existant,
   support imprimable, métrique scan et garde publique. Toute entrée non
   cartographiée bloque l'implémentation.
2. Introduire un contrat unique de cible QR côté serveur (kind, organisation,
   ressource, URL canonique, état et style), pas neuf générateurs copiés. Le
   client demande uniquement un QR pour une ressource qu'il peut lire ; le
   serveur revalide rôle, organisation et appartenance avant de produire ou
   enregistrer sa cible.
3. Ne pas étendre aveuglément `qr_codes`, dont le modèle actuel porte
   `campaign_id`. Après examen du schéma, choisir explicitement soit un registre
   générique de cibles QR, soit des adaptateurs qui conservent les QR historiques
   de campagne. La cible ne contient jamais une URL arbitraire fournie par le
   navigateur : elle est dérivée de la ressource validée.
4. Ajouter sur chaque éditeur une carte commune « Partager cette animation » :
   aperçu QR contrasté, URL copiable, téléchargement PNG/SVG ou affiche selon
   le style, libellé clair du jeu et avertissement quand le brouillon n'est pas
   publiable. Elle ne montre jamais un QR jouable pour un brouillon ou un accès
   suspendu.
5. Préserver les routes publiques existantes et leurs gardes : si un routeur
   intermédiaire de scan est retenu pour mesurer/faire tourner les QR, son token
   est opaque, rotatif/révocable, org-scopé et résout une cible allowlistée ;
   pas de redirection ouverte. La route finale revalide elle-même statut,
   entitlement et ressource. Les liens directs existants restent compatibles.
6. Normaliser les analytics de scan par expérience et QR, sans PII inutile.
   Séparer un scan d'une participation ; la mesure ne doit pas transformer un
   refresh ou un lecteur de QR en joueur inscrit.

### Tests et gates obligatoires

- Un test par expérience : owner/editor autorisé selon le contrat, ressource
  étrangère refusée, brouillon/suspendu sans QR jouable, QR publié menant au bon
  parcours joueur et lien direct restant compatible.
- Tests de sécurité du résolveur QR : token inventé, supprimé, expiré/roté,
  org différente, redirection arbitraire et accès sans entitlement refusés.
- E2E mobile : créer/ouvrir le QR depuis l'éditeur, scanner/ouvrir son URL,
  arriver sur le bon jeu puis effectuer le premier geste public autorisé.
  Vérifier que l'analytics compte le scan une fois sans créer de participation.
- Replay migration/pgTAP si une cible persistante est créée, puis typecheck,
  lint, unit, build, E2E et revue sécurité du diff avant toute publication.

Priorité : **P1**, après le lot de droits/publication dont il dépend. Bénéfice :
chaque animation est réellement activable sur place, sans bricolage d'URL.
Coût : moyen à élevé (contrat partagé, migration potentielle et neuf parcours).
Risque : briser une URL imprimée ou ouvrir une cible impayée ; migration
compatible, routes historiques et tests négatifs sont donc obligatoires.

### État détaillé vérifié — Passeport de fidélité

Le programme de fidélité est créé par un **owner ou editor** ayant le droit
Fidélité, depuis `/dashboard/loyalty` → « Nouveau programme » → nom. Il arrive
ensuite dans son éditeur, où il règle le mode de validation (code tournant au
comptoir ou validation en caisse), les niveaux/délais et au moins un palier. Le
programme ne peut devenir `active` qu'avec le module actif et un palier ; il est
alors servi au joueur sur `/passeport/[programId]`.

Le joueur ouvre ce lien, puis son passeport personnel est réellement créé lors
de la première visite validée : saisie du code tournant affiché sur l'écran
comptoir, ou présentation d'un QR de passeport temporaire au staff selon le
mode. Ce dernier QR est un laissez-passer de check-in court, pas le QR public
d'entrée du programme.

**Écart produit confirmé :** l'éditeur Fidélité affiche l'état et l'écran
comptoir, mais ne propose pas aujourd'hui la carte « Partager cette animation »
avec QR imprimable de `/passeport/[programId]`. Le commerçant doit donc fabriquer
ou diffuser cette URL hors du parcours. Le lot QR universel doit fournir ce QR
d'entrée, tout en conservant séparément le QR temporaire présenté au staff.

## Backlog QR complémentaire — pistes non approuvées

### P1 — Santé du QR et test avant impression

Chaque carte QR affiche un état concret : prêt à imprimer, publié et jouable,
suspendu, expiré ou cible supprimée. Le commerçant peut l'ouvrir dans une fenêtre
de test, imprimer une nouvelle version ou voir le dernier scan agrégé. Une
alerte apparaît seulement lorsqu'un QR affiché mène désormais à une expérience
inactive ; elle n'accuse jamais à tort le QR de « ne pas marcher » quand il n'a
simplement pas été scanné récemment.

**Bénéfice :** éviter qu'un client scanne une affiche obsolète au comptoir.
**Coût/risque :** faible à moyen ; l'état vient du résolveur public réel, pas
d'une colonne décorative. Ne pas enregistrer l'identité du scanneur pour cette
fonction.

### P1 — Code court de secours sur chaque affiche

Sous le QR, afficher une adresse lisible et, si le produit le justifie, un code
court à saisir sur une page publique (« Pas de scan ? Entrez ce code »). Le code
résout exactement la même cible QR, avec les mêmes gardes, limite anti-essais et
message non révélateur si la cible n'existe pas ou appartient à une autre
organisation.

**Bénéfice :** une caméra refusée, un écran rayé ou un QR mal imprimé ne fait
pas perdre le joueur ; amélioration d'accessibilité concrète. **Coût/risque :**
moyen : protéger l'énumération de codes et ne jamais faire de ce repli un accès
à une ressource suspendue.

### P2 — Étiquettes de support et attribution utile

Permettre à chaque QR d'être nommé selon son emplacement ou usage (« comptoir »,
« table 4 », « vitrine », « flyer match »). Les analytics présentent scans et
premier geste joueur par support, dans la même organisation, sans comparer des
personnes ni inventer une conversion quand l'identité n'est pas certaine.

**Bénéfice :** le commerçant sait où placer son prochain support. **Coût/risque :**
moyen, car il faut généraliser le libellé déjà possible sur les QR de campagne
sans dédoubler l'attribution ni collecter de PII.

### P2 — Rejoindre puis retrouver son jeu

Après un premier scan, proposer un accès discret au portefeuille/passeport du
joueur sur le même appareil : gains à retirer, tampons, animations en cours et
lien de retour vers le jeu concerné. C'est une continuité de l'identité joueur
existante, pas un compte obligatoire ni un profil public. L'affichage complet
attend l'extension sûre du Player Hub aux expériences qui progressent déjà les
missions mais ne les exposent pas encore toutes.

**Bénéfice :** le QR devient une porte d'entrée durable au lieu d'un lien jetable.
**Coût/risque :** élevé : respecter le cookie d'appareil, ne pas promettre une
récupération sur un autre téléphone et ne montrer aucun gain/jeu d'un autre
joueur.

## Pistes transversales pour l'ensemble de la solution — non approuvées

### P1 — Coffre à lots réutilisable

Les récompenses sont émises dans un registre commun, mais leurs définitions et
leurs stocks sont aujourd'hui configurés au niveau de chaque jeu. Proposer un
« Coffre à lots » où le commerçant prépare ses récompenses habituelles (café,
réduction, produit, invitation), puis les ajoute à un jeu sans réécrire titre,
conditions, visuel et valeur à chaque fois.

**Bénéfice commerçant :** moins de saisie, moins d'erreurs, une dotation plus
cohérente entre animations. **Bénéfice joueur :** le gain annoncé et celui
remis en caisse restent compréhensibles. **Risque/coût :** élevé : une définition
réutilisable ne doit jamais modifier un gain déjà émis, dont les détails restent
figés ; une éventuelle réserve de stock partagée exige des réservations atomiques
pour ne jamais sur-vendre. Commencer par un catalogue de contenu réutilisable,
puis valider séparément la mutualisation physique de stock.

### P1 — Centre d'animation du commerce

Une vue unique des animations, indépendamment du jeu : brouillons à terminer,
répétitions, QR à tester, campagnes en cours, stocks faibles, gains à remettre,
dates de fin et actions attribuées à l'équipe. Elle utilise les états existants
et leur donne un ordre opérationnel ; elle ne remplace ni les éditeurs ni la
caisse.

**Bénéfice :** un commerce qui utilise plusieurs jeux n'a plus à ouvrir neuf
pages pour savoir ce qui demande son attention. **Risque/coût :** moyen à élevé :
chaque alerte doit découler d'une donnée métier réellement fiable et être
cliquable vers une action accessible au rôle concerné. Mesurer la diminution des
animations oubliées/expirées, pas seulement les vues du tableau.

### P2 — Player Hub complet, sans compte obligatoire

Le portefeuille joueur existe déjà sur l'appareil qui a joué, et plusieurs
expériences font progresser des missions en base ; leur visibilité reste
partielle. Étendre progressivement ce Hub pour montrer gains, tampons,
animations en cours et progression de collection après un scan, tout en restant
attaché au cookie de l'appareil.

**Bénéfice :** le joueur revient pour une continuité, pas pour une série de
liens isolés. **Risque/coût :** élevé : aucune récupération « magique » sur un
autre téléphone, aucune donnée d'un autre joueur, et aucune promesse de compte
tant qu'un véritable mécanisme d'identité consentie n'existe pas.

### P2 — Calendrier d'occasions et modèles prêts à adapter

Faire remonter les modèles existants au bon moment : ouverture, anniversaire,
match, Noël, soldes, fête locale. Le commerce choisit une occasion, obtient un
brouillon daté dans son fuseau et passe par le guide, la répétition et le QR.
L'IA peut proposer le texte, jamais les règles ou les lots sans validation.

**Bénéfice :** réduit la page blanche et encourage une cadence d'animation
réaliste. **Risque/coût :** faible à moyen si le travail se limite aux blueprints
versionnés ; ne pas annoncer de calendrier automatique, d'envoi ou de données
événementielles sans une source et une validation explicites.

### Hors priorité immédiate — multi-établissement et intégrations caisse

Ces deux axes peuvent avoir une forte valeur commerciale, mais ils touchent aux
organisations, droits, stocks, attribution et support. Ils ne doivent pas être
ajoutés avant que les droits payants, QR universels, dashboard guidé et
récompenses communes soient validés sur des commerces pilotes. Une intégration
caisse ne doit jamais être simulée par import CSV ou webhook non authentifié.

### Décision propriétaire — amélioration transversale retenue uniquement

Le propriétaire retient **le Centre d'animation** : une vue unique des
brouillons, QR à tester, jeux en cours, stocks faibles, gains à remettre et
tâches d'équipe. Elle est la page opérationnelle de l'accueil et complète la
Carte de l'Aventure ; elle ne remplace ni les éditeurs spécialisés ni la caisse.

Procédé imposé : construire une carte/action seulement si son état provient
d'une source métier fiable et si son lien est autorisé pour le rôle courant.
Classer les éléments en « à préparer », « à lancer », « à suivre », « à
clôturer » et afficher une prochaine action explicable ; garder « Voir tout »
pour ne jamais cacher le reste. Les QR suspendus, droits expirés, stocks et
gains doivent utiliser les mêmes résolveurs que les parcours publics/caisse,
pas des compteurs UI approchés.

Mesurer la reprise de brouillon, la réalisation du test QR, le délai de première
publication et la réduction des gains/animations oubliés. Tests obligatoires :
owner/editor/cashier, tenant étranger, droit suspendu, stock épuisé, gain déjà
remis, lien disparu et affichage mobile/accessibilité. Ce lot suit les droits
effectifs, les QR universels et le dashboard guidé ; il se réalise dans un
worktree séparé.

Le Coffre à lots, Player Hub complet, Calendrier d'occasions, multi-établissement
et intégrations caisse restent des pistes non approuvées : ne pas les inclure
dans un chantier sans nouvelle demande explicite du propriétaire.

## Proposition produit — créer/continuer son Passeport après un jeu

### Constat vérifié

Une participation à un jeu ne crée actuellement pas un passeport de fidélité.
L'identité joueur commune peut connaître une participation par expérience, mais
Fidélité lit encore un cookie propre à chaque programme (`lc-loyalty-[programme]`)
et crée le membre à la première validation de visite. C'est pourquoi un joueur
qui vient de finir une Roue, un Quiz, une Chasse ou un autre jeu ne voit aucun
Passeport proposé à sa fin.

### Parcours recommandé

Sur l'écran de résultat d'une expérience éligible de la même organisation,
afficher une carte discrète et facultative : **« Gardez vos avantages chez
[commerce] — créer mon Passeport »**. Un clic crée ou rattache le passeport du
joueur sur cet appareil et affiche immédiatement ses niveaux, paliers et la
prochaine façon de valider une visite. Le joueur peut ignorer la carte sans
perdre son résultat de jeu ni devoir créer un compte.

Règle essentielle : **participer à un jeu ne vaut pas automatiquement une
visite fidélité.** Par défaut, le premier tampon exige toujours la preuve
choisie par le commerce (code tournant au comptoir ou validation staff). Ainsi,
un jeu partagé à distance, une page rechargée ou un participant frauduleux ne
produit pas de récompense de fidélité. Le commerçant peut ultérieurement choisir
une opération spéciale « jeu vérifié sur place = un tampon de bienvenue », mais
seulement après une décision produit séparée, une source QR/ressource vérifiée,
une émission idempotente et des limites économiques explicites.

### Accès obtenu par le joueur

Le joueur voit uniquement son propre passeport sur cet appareil : visites,
tampons, niveau, paliers futurs, récompenses/code de retrait et éventuel tour
offert. Il n'obtient aucun accès au dashboard, aux autres clients, à la caisse
ni aux réglages. Aucune récupération automatique sur un autre appareil ne doit
être promise tant qu'un mécanisme d'identité joueur consentie n'existe pas.

### Procédé sûr pour Claude

1. Ajouter ce CTA seulement lorsque le programme Fidélité est actif, appartient
   à l'organisation de l'expérience terminée et passe les droits effectifs.
2. Créer un pont serveur idempotent entre l'identité de l'expérience source et
   le cookie/identité Fidélité, sans accepter `organization_id`, `program_id` ou
   identité d'un autre joueur depuis le navigateur. Valider les FK tenant et ne
   jamais transformer un simple affichage de résultat en écriture de gain.
3. Distinguer « passeport initialisé » et « visite validée » dans les données et
   la microcopy. Le CTA ne doit pas déclencher d'email, SMS, consentement ou
   récompense sans choix séparé.
4. Tester : résultat de jeu → création volontaire → retour au passeport ; même
   joueur/deuxième jeu idempotent ; programme inactif, org étrangère, cookie
   perdu et rôle d'accès refusés ; absence de nouveau tampon/gain après le CTA.

Priorité : **P1 après QR universels et droits effectifs**. Bénéfice : transformer
une participation ponctuelle en relation fidèle sans forcer un compte. Coût :
moyen à élevé (pont d'identité et tests sécurité). Risque : attribuer un tampon
ou exposer un passeport inter-tenant ; les séparations ci-dessus sont donc non
négociables. Statut : proposition non approuvée pour implémentation.

### Décision propriétaire — création du Passeport et attribution des tampons

Le joueur peut créer/continuer son Passeport juste après un jeu, sans compte
obligatoire. L'attribution du tampon dépend toutefois de l'origine vérifiée :

| Origine du parcours | Passeport | Tampon fidélité |
| --- | --- | --- |
| Lien partagé direct, réseau social ou URL canonique | Créé/continué sur l'appareil | Non |
| QR officiel créé par le commerçant pour cette ressource | Créé/continué | Oui, si le programme autorise les visites par QR |
| Achat/visite validé à la caisse ou par intégration authentifiée | Créé/continué si nécessaire | Oui |

Un QR en soi ne prouve pas matériellement que le joueur se trouve encore dans le
commerce : il peut être photographié ou transféré. Le système peut donc prouver
qu'il vient d'un **QR officiel LastChance**, pas une présence physique. Pour un
commerce qui veut une preuve forte, le tampon doit rester confirmé par code
tournant, staff ou achat encaissé ; l'option « QR compte comme visite » est un
choix explicite du commerçant, borné par son délai entre visites et ses limites
économiques.

Procédé technique : le QR officiel porte une cible opaque et org-scopée, résolue
par le serveur ; le scan crée une origine vérifiée, de durée bornée, liée à la
ressource et à l'identité appareil. Une URL canonique partagée ne porte jamais
cette origine. Au moment du CTA de fin de jeu, le serveur décide seul
`passport_created` et, le cas échéant, `stamp_eligible` ; le navigateur ne peut
ni déclarer un QR, ni choisir programme/organisation, ni rejouer l'opération.
Unicité par origine/participation, cooldown du programme et clé d'idempotence
empêchent double tampon ou cumul QR + achat pour la même visite, sauf règle
commerciale explicite.

Microcopy attendue : après un lien partagé, « Créez votre Passeport — votre
prochaine visite validée ajoutera un tampon » ; après QR officiel éligible,
« Votre Passeport est créé — 1 tampon ajouté » ; après caisse, « Visite validée
— 1 tampon ajouté ». Tests obligatoires : lien partagé sans tampon, QR officiel
éligible, QR transféré/cooldown, achat idempotent, double source, tenant
étranger et programme suspendu.

## Proposition produit — fidélité des commandes Uber Eats / Deliveroo

### V1 recommandée : carte unique dans le sac, sans intégration plateforme

Pour chaque commande livraison préparée, le restaurant glisse une petite carte
ou un sticker portant un QR et un code court **uniques, à usage unique**. Le
client scanne le QR ou saisit le code : LastChance crée/continue son Passeport
et ajoute un tampon « commande livrée ». La carte peut être préimprimée en lot
ou générée depuis le dashboard/caisse au moment de préparer le sac. Aucun nom,
email, téléphone, adresse ou contenu de commande Uber/Deliveroo ne transite
dans LastChance.

Le QR générique imprimé sur le menu, le flyer ou le sac reste utile, mais ne
fait que créer/continuer le Passeport : il ne donne pas de tampon. C'est le code
unique inséré dans la commande qui prouve commercialement l'opération ; le
premier téléphone qui le réclame reçoit le tampon. Le code porte une expiration
courte à décider (candidat : quatorze jours), une référence de commande
pseudonymisée/hachée si elle existe, une organisation et un programme validés
serveur. Il est consommé atomiquement et un rejouer ne révèle ni client ni
commande.

### Parcours opérationnel simple

`Commande acceptée → équipe prépare le sac → glisse carte QR/code unique →
client reçoit → scan/saisie → Passeport + 1 tampon`

Sur l'écran commerçant : « Générer une carte livraison », puis choix du
programme actif et, facultativement, d'une référence courte visible sur le bon
de préparation. L'équipe peut aussi préparer une planche de cartes numérotées
à l'avance et marquer laquelle a été mise dans quel sac, sans saisir la moindre
donnée du client final. Une commande annulée avant départ invalide la carte si
elle est encore inutilisée.

### Phase 2 seulement : intégration partenaire/POS

Une intégration avec Uber Eats, Deliveroo ou un agrégateur/POS peut ensuite
créer/invalider automatiquement la carte à partir d'un événement de commande.
Elle doit être optionnelle, par commerce, avec autorisation formelle du
prestataire, OAuth/identifiants côté serveur, webhooks signés, allowlist de
stores et déduplication stricte par `(provider, store, order_id)`. Le tampon
est éligible à l'état réellement livré/remis, pas à une simple intention de
commande ; le système ne pilote jamais acceptation, annulation, menu ou
paiement de la plateforme.

Ne pas commencer cette phase par un import CSV, un scraping de tablette, la
copie de données client ou un webhook non authentifié. Les plateformes gardent
leurs données client ; LastChance n'a besoin que d'un statut de commande et
d'une référence pseudonymisée. Si une API est indisponible ou non approuvée,
la carte dans le sac continue de fonctionner.

### Tests et risques à traiter avant code

- code inventé, expiré, déjà consommé, annulé, mauvais programme ou mauvais
  tenant refusés avec une réponse non révélatrice ;
- deux scans concurrents → un seul tampon, une seule création de passeport ;
- lien/QR générique → passeport possible mais zéro tampon ;
- achat livraison et QR officiel ne créent pas deux tampons pour la même
  commande ; cooldown et plafond du programme conservés ;
- E2E depuis un QR de carte jusqu'au passeport, sans PII dans URL, logs ou
  analytics.

Priorité : **P2**, après le QR universel et le pont de Passeport post-jeu.
Bénéfice : convertir les livraisons en fidélité directe, sans dépendre du canal
de marketplace. Coût : moyen pour les cartes uniques ; élevé pour les API.
Statut : proposition non approuvée pour implémentation.

### UX recommandée — cartes fidélité préparées par lots

Ne pas demander à l'équipe de créer un QR à chaque commande. Dans le dashboard,
le commerçant choisit son programme puis clique une fois sur **« Imprimer 50
cartes livraison »**. LastChance produit une planche/PDF de petites cartes :
chacune contient un QR unique, un code court de secours et la mention « Scannez
pour ajouter votre tampon ». L'équipe prend simplement la carte suivante et la
glisse dans le sac ou le colis ; aucune saisie, aucun appairage de commande et
aucune ouverture de dashboard au moment du rush.

Les cartes suivent des états simples : `neuve`, `réclamée`, `expirée`, et,
facultativement, `mise dans un sac` si l'équipe veut les scanner au packing. Ce
dernier suivi reste optionnel : la V1 marche avec une pile physique. Une carte
réclamée ne peut jamais être utilisée par un second téléphone. Une planche
inutilisée peut être désactivée/rotée en bloc. Le code court rend le parcours
accessible si la caméra ne lit pas le QR.

### Réemploi pour boutique en ligne

Le même objet devient une **carte de commande** pour e-commerce :

- colis physique : carte QR/code dans le paquet ;
- retrait magasin : carte donnée au comptoir ;
- achat entièrement numérique : le site e-commerce affiche le QR/code unique
  sur sa page de confirmation ou dans son email transactionnel, sans transmettre
  la donnée client à LastChance.

La V1 manuelle par planches fonctionne pour Shopify, WooCommerce, site maison,
Uber Eats et Deliveroo. Une intégration ultérieure génère la même carte unique
quand une commande passe à l'état « préparée/livrée » : le marchand ou son site
appelle une API serveur authentifiée avec une référence de commande pseudonymisée
et reçoit le QR/code à imprimer ou afficher. LastChance ne lit ni le panier, ni
l'adresse, ni l'email du client, et ne fait pas d'envoi à sa place.

Choix à documenter avant implémentation : durée de validité (candidat : quatorze
jours), quota de planches, politique d'annulation et règle commerciale si une
carte physiquement transférable est réclamée par un tiers. Une carte insérée dans
le colis prouve une opération commerciale mieux qu'un QR générique, mais elle ne
prouve pas l'identité de l'acheteur ; le premier appareil qui la réclame reçoit
le tampon, dans les limites/cooldown du programme.

### Décision propriétaire — création du Passeport depuis une carte unique

Le QR/code unique de livraison ou commande doit fonctionner dans les deux cas :

- passeport déjà présent sur cet appareil : le code ajoute son tampon unique ;
- aucun passeport : la page propose clairement « Créer mon Passeport et ajouter
  mon tampon », puis crée le passeport pseudonyme et consomme le code dans la
  même opération atomique.

Il n'y a ni mot de passe, ni formulaire de compte, ni PII obligatoire. Le joueur
voit d'abord le nom/logo du commerce et ce que crée le geste (un passeport sur
cet appareil + un tampon), puis confirme ; un lien « Pas maintenant » ne
consomme pas la carte. Après succès, il arrive directement sur son passeport
avec le nouveau tampon et les prochains paliers. Une seconde ouverture affiche
un statut générique « déjà utilisé » sans identifier la personne qui l'a
réclamée.

Le serveur réalise dans une unique transaction : validation de la carte,
résolution/création de l'identité appareil, création du membre si absent,
contrôle cooldown/stock, ajout éventuel du tampon et consommation définitive du
code. Les tests de concurrence doivent prouver qu'un QR/code ne donne jamais
deux passeports/tampons, même ouvert simultanément sur deux téléphones.
