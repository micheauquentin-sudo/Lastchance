# Transmission Codex -> Claude Code

Document de reprise opérationnelle. Il décrit l'état courant et les décisions
encore utiles; l'historique détaillé vit dans `docs/journal.md` et les décisions
durables dans `docs/decisions.md`.

## Règles de reprise

- Lire ce fichier, `CLAUDE.md`, puis les sections utiles de `docs/roadmap.md`,
  `docs/bugs.md`, `docs/decisions.md` et `docs/journal.md`.
- Vérifier `git status --short` avant toute modification. Les fichiers modifiés,
  non suivis et les autres worktrees appartiennent à l'utilisateur tant qu'ils
  ne sont pas explicitement inclus.
- Pour une migration, lire `EXPECTED_MIGRATION` dans `src/lib/release.ts`.
  Ne jamais recopier un numéro de migration depuis un ancien compte-rendu.
- Chaque lot doit avoir un terrain précis, un critère de sortie vérifiable et
  un périmètre de fichiers. Pas de refonte opportuniste, pas de secret dans le
  dépôt ou les logs.
- Codex pilote audits et validation. Claude Code reste autonome et n'est lancé
  que par l'utilisateur. Ne pas lire ses sessions ni modifier ses réglages.

## État de livraison vérifié au 2026-09-16

- `main` contient la mise à jour des dépendances racine de la PR #381, au SHA
  `8fe8db2b184b1d10b14d769764f13bf55ee94205`. La CI PR #381 était verte sur
  son SHA `b9b2bbd352ef4147727b37d353ae561f4a66abfa`, y compris E2E Chromium /
  WebKit, avant la fusion. La CI `main` post-fusion doit toujours être relue
  sur le SHA exact avant de déclarer la livraison finie.
- La PR #376 (dépendances `site/`) a été rebasée sur ce `main`; son head est
  `f730097e56588a729fe25fb487572a7f4c805181` et sa CI complète est en cours.
  Ne pas la fusionner tant que tous les jobs requis et Vercel ne sont pas verts.
- La PR obsolète #140 (`actions/cache@v6`) a été fermée: `main` utilisait déjà
  cette version. Les branches déjà prouvées ancêtres de `main` ont été purgées
  localement; les branches WIP et le worktree `Lastchance-codex-tout` restent
  hors ménage automatique.

## Travail de simplification en cours

Ces lots sont isolés dans des worktrees et ne doivent pas être mélangés au
travail local de l'utilisateur. Après rebase sur le `main` final, chaque lot
doit être poussé dans une PR séparée et recevoir la CI complète.

1. **Sources documentaires** — commit local `bd0fea32` sur
   `codex/cleanup-docs-source`. Les anciens états `.claude/state/` sont devenus
   des redirections; les références actives pointent vers les documents
   courants; `CLAUDE.md` exige désormais un `git status` réel.
2. **Quiz dashboard** — commit local `57aa9ac3` sur
   `codex/cleanup-quiz-editor`. Types, questions et récompenses sont séparés;
   l'API publique des composants est conservée. Preuves locales: ESLint ciblé
   vert et `studio-charge.test.tsx` 34/34. Le typecheck global Windows a
   dépassé le délai avec plus de 2 Go de mémoire; la CI est obligatoire.
3. **Passeport fidélité** — commit local `eddc1053` sur
   `codex/cleanup-loyalty-passport`. Les quatre blocs présentiels sont isolés;
   l'échange serveur est injecté uniquement dans le conteneur joueur. Preuves:
   ESLint ciblé vert et tests Studio 45/45. Même limite de typecheck local.
4. **Codes de retrait** — commit local `6a6e37c5` sur `codex/cleanup-core`.
   Un helper Zod centralise dix chaînes sans changer les regex, types ou
   messages. Typecheck, lint et 546 tests ciblés étaient verts. Revue sécurité
   lecture seule: SHIP, aucun finding exploitable.
5. **Outillage V2** — commit local `2e28ea60` sur `codex/cleanup-v2-scripts`.
   Les deux noms de scripts ignorés ont été retirés de `.gitignore` afin qu'une
   future recréation soit visible. Les copies locales ignorées ne sont pas
   supprimées sans sauvegarde récupérable.
6. **Réserver** — extraction du bloc stock de `src/lib/reserver.ts` vers un
   module dédié, sans changement RPC, export ou contrat. Le travail est encore
   en revue; aucune PR ne doit être ouverte avant ses tests ciblés.

## Travail utilisateur à préserver

Dans l'arbre Windows d'entrée, ne pas écraser ni ajouter à un commit générique:

- les changements marketing et `next.config.ts` présents dans `git status`;
- les routes et composants non suivis sous `src/app/(public)/`,
  `src/components/marketing/` et les API de traitement d'assets;
- `docs/audit-release-gate-adr-183-2026-09-14.txt`, `site/public/` et les
  images `public/panorama/` non suivies;
- le second worktree `Lastchance-codex-tout` et sa branche de reliquats.

## Bloquants produit encore ouverts

- Le GO commercial reste fermé tant que le DNS GoDaddy n'applique pas les
  enregistrements A demandés par Vercel (`@` et `app` vers `76.76.21.21`), que
  TLS et `NEXT_PUBLIC_APP_URL` n'ont pas été relus après redéploiement.
- Google Wallet reste bloqué par les trois variables Vercel
  `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_CLIENT_EMAIL` et
  `GOOGLE_WALLET_PRIVATE_KEY`. Ne jamais écrire la clé privée ici.
- La capacité de production n'est pas certifiée par un smoke HTTP local. Il
  faut un environnement isolé, des métriques CPU/RAM/connexions/Realtime, des
  paliers 100 puis 250 joueurs et un soak de 30 minutes; le plan Vercel Hobby
  doit aussi être remplacé ou explicitement accepté par le propriétaire.
- Toute décision de réactivation de lots à valeur inconnue doit utiliser les
  valeurs réelles du commerçant ou retirer les lots du tirage; ne jamais
  inventer un montant.

## Fini quand

- Chaque PR de simplification est sur le `main` courant, avec typecheck, lint,
  tests ciblés, build ou garde SQL adapté, puis tous les jobs GitHub requis
  verts sur le head exact.
- Après chaque fusion, la CI `main`, Vercel et le workflow de santé sont reliés
  au même SHA et relus. Aucun déploiement, migration, mutation Stripe ou
  suppression de fichier utilisateur n'est fait sans demande explicite.
- Le statut de l'arbre d'entrée confirme que seuls les changements utilisateur
  restent locaux; les worktrees Codex sont propres ou supprimés après fusion.
