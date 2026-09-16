# Transmission Codex -> Claude Code

Document de reprise opérationnelle. L'historique détaillé vit dans
`docs/journal.md`; les décisions durables vivent dans `docs/decisions.md`.

## Règles de reprise

- Lire ce fichier, `CLAUDE.md`, puis les sections utiles de `docs/roadmap.md`,
  `docs/bugs.md`, `docs/decisions.md` et `docs/journal.md`.
- Vérifier `git status --short` avant toute modification. Les fichiers modifiés,
  non suivis et les autres worktrees appartiennent à l'utilisateur tant qu'ils
  ne sont pas explicitement inclus.
- Pour une migration, lire `EXPECTED_MIGRATION` dans `src/lib/release.ts`.
  Ne jamais recopier un numéro depuis un ancien compte-rendu.
- Chaque lot doit avoir un périmètre précis, une preuve vérifiable et aucun
  changement opportuniste. Ne pas mettre de secret dans le dépôt ou les logs.
- Codex pilote audits et validation. Claude Code reste autonome et n'est lancé
  que par l'utilisateur; ne pas lire ses sessions ni modifier ses réglages.

## État vérifié le 2026-09-16

- `main` est au SHA `f965f4f47d5e9b025438f6f8f6a6624c625f74b6`. Les PR #381 et
  #376 (dépendances), #385 (passeport fidélité) et #386 (schémas de retrait)
  sont fusionnées. La CI complète de ce SHA est verte; après chaque nouvelle
  fusion, relire CI, Vercel et le workflow de santé sur le SHA exact.
- La PR obsolète #140 (`actions/cache@v6`) est fermée car `main` utilise déjà
  cette version. Les branches déjà prouvées ancêtres de `main` ont été purgées.
- Les lots de simplification encore ouverts sont #383 (sources documentaires),
  #384 (éditeur de quiz), #387 (scripts V2) et #388 (stock Réserver). Ne jamais
  fusionner un head derrière `main` ou avec un job requis en attente.

## Lots livrés ou en attente

- **Sources documentaires (#383)**: états `.claude/state/` réduits à des
  redirections, références recentrées sur les documents courants et `CLAUDE.md`
  contrôlé par un `git status` réel.
- **Éditeur de quiz (#384)**: types, questions et récompenses séparés; API
  publique conservée; aperçu d'image utilisateur rendu via `next/image` non
  optimisé. Preuves locales: ESLint ciblé et 34 tests Studio.
- **Scripts V2 (#387)**: les deux noms de scripts locaux ont été retirés de
  `.gitignore` pour rendre toute recréation visible. Les copies locales restent
  à sauvegarder avant déplacement.
- **Stock Réserver (#388)**: bloc stock extrait vers
  `src/lib/reserver-stock.ts`, sans changement RPC, export ou contrat.

## Travail utilisateur à préserver

Dans l'arbre Windows d'entrée, ne pas écraser ni inclure dans un commit
générique les changements marketing, `next.config.ts`, les routes et composants
non suivis sous `src/app/(public)/`, `src/components/marketing/` et les API
d'assets, le rapport `docs/audit-release-gate-adr-183-2026-09-14.txt`,
`site/public/`, les images `public/panorama/`, ni le worktree
`Lastchance-codex-tout` et sa branche de reliquats.

## Bloquants produit hors de ce ménage

- GO commercial: DNS GoDaddy (`@` et `app` vers `76.76.21.21`), TLS et
  `NEXT_PUBLIC_APP_URL` à relire après redéploiement.
- Google Wallet: variables Vercel `GOOGLE_WALLET_ISSUER_ID`,
  `GOOGLE_WALLET_CLIENT_EMAIL` et `GOOGLE_WALLET_PRIVATE_KEY`; ne jamais
  écrire la clé privée ici.
- Capacité: certification réelle requise (paliers 100 puis 250 joueurs,
  soak 30 minutes, CPU/RAM/connexions/Realtime) et décision sur Vercel Hobby.
- Lots à valeur inconnue: utiliser les valeurs du commerçant ou retirer ces
  lots du tirage; ne jamais inventer un montant.

## Fini quand

- Chaque PR de ménage est fusionnée après typecheck, lint, tests ciblés, build
  ou garde SQL adaptée, puis tous les jobs GitHub requis et Vercel sont verts
  sur le head exact.
- Après chaque fusion, CI `main`, Vercel et santé post-déploiement sont reliés
  au même SHA et relus. Aucun déploiement, migration, mutation Stripe ou
  suppression de fichier utilisateur sans demande explicite.
- L'arbre d'entrée ne contient que les changements utilisateur locaux; les
  worktrees Codex propres sont retirés, sauf `Lastchance-codex-tout`.
