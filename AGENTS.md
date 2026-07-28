# Lastchance — Instructions de pilotage

## Contexte à charger

- Lire `CLAUDE.md` avant tout chantier significatif.
- Consulter les sections pertinentes de `.claude/state/checkpoint.md` et
  `.claude/state/project-state.md` avant de modifier un domaine existant.
- Traiter les fichiers non suivis et les modifications présentes comme des
  changements appartenant à l'utilisateur : ne pas les écraser ni les inclure
  automatiquement dans un commit.

## Orchestration

- Codex pilote : il utilise ses propres agents pour les audits, l'analyse,
  l'architecture, la qualité et les changements significatifs.
- Un audit complet mobilise les agents Codex pertinents sur produit,
  architecture, qualité, performance et sécurité ; un audit ciblé mobilise
  seulement les regards qui apportent une preuve utile.
- Avant un travail significatif, annoncer l'agent Codex choisi et pourquoi il
  offre le meilleur rapport efficacité/coût.
- Toute proposition doit préciser le constat ou l'hypothèse vérifiable, le
  bénéfice concret pour commerçant ou joueur, la priorité, le coût et le risque.
  Les propositions sans valeur démontrable sont écartées.
- Claude Code reste autonome dans VS Code. Il récupère les décisions et le
  dernier état dans `docs/codex-handoff.md`, puis choisit lui-même ses agents,
  son modèle et son déroulement. Codex ne se connecte pas à ses sessions et ne
  modifie ni ses réglages ni ses autorisations.
- Après chaque audit, demande d'amélioration, proposition ou décision, Codex
  met à jour `docs/codex-handoff.md` avec l'état réel et le travail restant.

## Contrat de livraison

- Diff minimal, aucune refonte opportuniste.
- Entrées externes validées, isolation multi-tenant préservée, aucun secret ou
  renseignement personnel dans les logs et les réponses.
- Une migration Supabase est appliquée et vérifiée avant le code de production
  qui en dépend.
- Un déploiement Vercel de production, une promotion, un rollback ou une
  mutation financière Stripe exige une demande explicite de l'utilisateur.
- Ne jamais déployer un arbre de travail sale sans avoir isolé et confirmé les
  changements inclus.
- Toute livraison significative se termine par les vérifications adaptées,
  un résumé des fichiers touchés, des commandes exécutées et des risques
  résiduels.
