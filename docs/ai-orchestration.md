# Coordination Codex / Claude Code

Codex pilote le projet avec ses propres agents. Avant tout travail significatif,
il annonce l'agent retenu et la raison du choix, en privilégiant le meilleur
rapport efficacité/coût.

Claude Code reste utilisé manuellement dans VS Code. Il consulte
[`codex-handoff.md`](./codex-handoff.md) pour connaître le dernier audit, les
décisions et le travail restant, puis gère librement ses agents, son modèle et
son déroulement.

Codex ne se connecte pas aux sessions Claude, ne modifie pas ses réglages et
ne lui impose aucun agent. Il met à jour le dossier de transmission lors de sa
prochaine revue, après comparaison avec l'état réel du dépôt.

Les commits, push, déploiements, migrations distantes, changements Stripe et
secrets nécessitent toujours l'accord explicite de l'utilisateur.
