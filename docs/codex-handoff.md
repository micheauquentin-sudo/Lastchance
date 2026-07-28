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
