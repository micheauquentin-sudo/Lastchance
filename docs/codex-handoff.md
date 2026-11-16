# Transmission Codex -> Claude Code

## Recherche de nom de marque — reprise du 2026-10-14

La recherche est ouverte : aucune décision de remplacement de « LastChance »
n'est prise. Le périmètre de la marque ombrelle couvre désormais la Vitrine,
la réservation, les expériences en commerce et la fidélité ; un nom limité à
la roue ou au hasard serait donc trop étroit. Les pistes ci-dessous sont une
exploration créative uniquement : disponibilité domaine, marques déposées,
prononciation internationale et conflits SEO restent à vérifier avant toute
sélection.

Première sélection à évaluer avec l'utilisateur : **Complice**, **Élan**,
**Éclat**, **Rituel**, **Pépite**, **Sésame**, **Lumo** et **Nolio**.

Critères retenus : promesse positive et immédiatement compréhensible, mémorable
en français, prononçable en anglais, crédible pour un commerçant, chaleureuse
pour un joueur, et extensible aux modules Vitrine / Réserver / Expériences.

Prochaine décision : choisir deux ou trois territoires de ton (relation,
moment, découverte, énergie ou nom inventé), puis effectuer une recherche de
disponibilité et de risques sur une shortlist courte. Aucun code, domaine,
configuration ou texte public n'est modifié à ce stade.

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

## État vérifié le 2026-11-16 (audit & préparation GO)

- **CSP `/studio` et réécriture `/vitrine-reservation`**: `matchesPrefix` (`src/lib/security-headers.ts`) limite désormais le régime `sensitive` aux sous-routes `/studio/` afin de laisser `/studio` (`studio.html`) s'exécuter en régime `static`; `src/proxy.ts` réécrit aussi `/vitrine-reservation` vers `/h-site-final-20k/vitrine-reservation.html`.
- **Site vitrine `h-site-final-20k`**: ajout du bouton `/login` dans l'en-tête (`pop-btn-ink`, contraste préservé sur `.header-nav-annex`) et des liens `/legal`, `/privacy`, `/terms`, `/cookies`, `/login` dans le pied de page des pages publiques, synchronisé avec `propositions-site/h-site-final-20k/`.
- **Qualité & sécurité dépendances**: 18 warnings ESLint éliminés (0 erreur, 0 warning); `next@16.4.6`, `@sentry/nextjs@10.78.0`, `sharp@0.35.5`, `zod@^4.6.7`, `vitest@4.1.12` et `overrides` mis à jour sur racine et `site/` (**0 vulnérabilité** `npm audit` des deux côtés); `scripts/audit-avec-reprises.mjs` rétabli sur `process.exit(1)` avec `shell: process.platform === "win32"`; PR Dependabot #390, #402 et #403 fermées.
- **Production Supabase & Vercel**: les 25 lots gagnants à `value_cents IS NULL` des 8 campagnes historiques en pause de `CLUB` (`c5bed2d4-1952-40cc-9ca9-2e742db86fe8`) ont été régularisés avec des valeurs `< 20 €` et un stock fini (`50` si nul); `Soirée` et `Saint-Valentin` (fenêtre étendue au `2026-12-31`) ont été réactivées (`status = 'active'`, `/play/MHD5RUB3` HTTP 200). `RESEND_FROM_EMAIL` (`LastChance <onboarding@resend.dev>`) a été posée dans Vercel Production.
- **Preuves locales fraîches**: `migrations:check` (219, head `20261221120000`), `sql:check`, `casts:check`, `typecheck`, `lint` (0/0), `npm audit` (0/0 racine et `site/`), `build` Next 16.4.6 (70 pages racine, 8 pages `site/`), `npm test` (438 fichiers / 7 782 tests) et tests Node (`casts`, `sql`, `migrations`, `production-health`) tous verts.
- **Reliquats propriétaire restants hors dépôt**: DNS GoDaddy (`A @` et `A app` → `76.76.21.21`) puis mise à jour `NEXT_PUBLIC_APP_URL` + redéploiement; passage au plan Vercel Pro; variables `LEGAL_ENTITY_NAME` et `LEGAL_POSTAL_ADDRESS` sur Vercel Production; vérification mode Live Stripe/webhook sur domaine final; optionnels `CRON_SECRET` GitHub Secrets, `GOOGLE_WALLET_*`, canal SMS Brevo, et banc de capacité live 250 joueurs.

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
