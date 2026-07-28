# Plan central du projet LastChance

> Dernière vérification : 2026-07-27. Ce document donne une vue de pilotage ;
> le code, Git et les contrôles exécutés restent les sources de preuve.

## Règles de pilotage

Le cadre d'orchestration, les rôles Codex/Claude et la validation préalable du
client sont définis dans [ai-orchestration.md](./ai-orchestration.md). Chaque
nouveau lot doit être inscrit ici avant son exécution, avec un responsable, un
objectif vérifiable et une décision explicite de lancement.

## État observé

- Branche locale : `chantier/audit-3`.
- Dernier commit local observé : `7f24ab0` (`test: justify Stripe mock casts`).
- Dernier commit `origin/main` observé : `682981e`.
- L'arbre de travail contient des modifications et fichiers non suivis
  antérieurs à ce plan ; ils ne font partie d'aucun lot sans validation
  explicite.

## Lot actif

Aucun nouveau lot produit n'est autorisé à cette date. La présente mise en
place documentaire et le centre de commande servent à préparer le prochain
chantier, sans modifier le produit ni le déploiement.

## Risques et prérequis confirmés

1. Les contrôles de fiabilité E2E restent un sujet ouvert : le checkpoint
   documente un scénario de méta-progression instable qui nécessite un
   chantier dédié de seed de données.
2. Toute évolution touchant aux migrations, RLS, routes publiques, webhooks
   ou Stripe doit passer par les agents spécialisés, une revue de sécurité et
   les vérifications locales Docker/WSL avant toute décision de publication.
3. Aucun commit, push, fusion, changement de configuration distante ou
   déploiement ne peut être déduit de ce plan : une autorisation explicite est
   requise à chaque fois.

## Prochain lot à soumettre

**Fiabiliser l'E2E de méta-progression par un seed de données dédié.**

- Objectif : rendre le scénario déterministe sans masquer les défauts par des
  reprises automatiques.
- Responsables pressentis : `db-supabase`, `qa-verify`, puis
  `security-review` si des frontières publiques ou de données sont touchées.
- Preuves attendues : migration ou seed validé localement dans Docker/WSL,
  tests ciblés puis suite adaptée, diff relu et risques résiduels consignés.
- Décision : en attente de votre validation.

## Modèle de suivi d'un lot

| Élément | À renseigner avant lancement |
| --- | --- |
| Nom et objectif | Résultat observable et périmètre précis |
| Responsable | Agent Claude spécialisé choisi par Codex |
| Étapes | À faire / en cours / vérifié / bloqué |
| Preuves | Commandes, tests ou contrôles réellement exécutés |
| Risques | Restes, dépendances et décision demandée |
| Publication | Commit, push ou déploiement uniquement après accord |
