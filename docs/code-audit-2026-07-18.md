# Audit du code après Studio créatif et Pronostics — 2026-07-18

## Périmètre et verdict

Revue du code final et des sept commits compris entre `393270f` et `3edb473`,
soit 34 fichiers applicatifs touchés et environ 6 000 lignes ajoutées depuis
`0d54d53`. Le périmètre couvre le preset de roue Kermesse, le Studio QR,
l'éditeur d'affiche libre et l'addon Pronostics.

Le socle Next.js/Supabase reste cohérent et les nouveaux éditeurs appliquent
une validation serveur stricte. Le module Pronostics initial comportait en
revanche plusieurs écarts bloquants pour une mise en production ouverte : ACL
incomplète sur la colonne d'addon, écritures et recalculs non transactionnels,
absence d'intégrité multi-tenant composite et exposition des données joueurs
aux éditeurs. Ils sont corrigés par la migration `00023` et les changements
applicatifs associés.

Verdict : **bêta privée validable après application de `00023` et passage du
job PostgreSQL de CI**. Une ouverture à gros volume demande encore les travaux
de dimensionnement et E2E listés plus bas.

## Nouvelles capacités

### Roue Kermesse

- Nouveau preset aligné avec la direction artistique du produit : crème,
  encre, jaune et orange.
- Le preset réutilise le moteur de style existant ; il n'ajoute pas de chemin
  de rendu ni de donnée dynamique spécifique.

### Studio QR

- Matrice générée par `qrcode`, puis dessinée par un moteur Canvas interne.
- Huit motifs de modules, quatre styles d'yeux, couleurs unies ou dégradées,
  logo redimensionné, bannière et texte d'appel à l'action.
- Presets mélangeables, aperçu direct et exports PNG 512/1024/2048 px.
- Style stocké en `qr_codes.style`, revalidé par Zod dans la Server Action.
- Zone de silence portée à quatre modules pour respecter la recommandation QR.

### Éditeur d'affiche libre

- Modèle `version: 2` composé de 60 calques maximum : texte, forme, image ou QR.
- Déplacement, redimensionnement, rotation, ordre d'empilement, rognage
  d'images et 18 formes décoratives.
- Quatre modèles et 28 polices ; migration automatique des anciennes affiches
  à champs fixes.
- Images réencodées côté navigateur, data URLs bornées à 500 ko par élément et
  payload total refusé au-delà de 3 Mo.
- Rendu partagé entre l'éditeur et l'impression A4.

### Addon Pronostics

- Catalogue embarqué de compétitions et mode match libre.
- Championnat en brouillon, actif ou terminé ; collecte email/téléphone
  paramétrable ; matchs et coups d'envoi configurables.
- Inscription publique, identité par cookie HTTP-only et jeton aléatoire dont
  seul le SHA-256 est stocké.
- Pronostic modifiable jusqu'au coup d'envoi, résultats manuels, barème
  exact/différence/vainqueur, récompenses par rang et classement public.
- Activation de l'addon depuis la fiche commerçant du back-office, avec session
  admin récente et journal d'audit.

## Flux Pronostics après durcissement

1. `/pronos/[slug]` charge uniquement les colonnes publiques via la
   service-role et vérifie organisation, abonnement, addon et statut.
2. L'inscription vérifie Zod, Turnstile, la limite par championnat/IP, les
   champs réellement demandés et le consentement. Les données non demandées
   sont supprimées côté serveur.
3. Le navigateur reçoit un cookie HTTP-only `SameSite=Lax`; la base ne garde
   que son hash.
4. La soumission retrouve le joueur, applique deux limites (IP partagée puis
   joueur) et appelle `submit_contest_prediction()`.
5. La RPC verrouille le championnat et le match, revérifie statut et heure
   PostgreSQL, puis effectue l'upsert. Une requête commencée avant le coup
   d'envoi ne peut plus écrire après sa fermeture.
6. `set_contest_match_result()` écrit le résultat et recalcule toutes les
   grilles dans la même transaction.
7. `update_contest_scoring()` change le barème et recalcule tous les matchs
   terminés dans la même transaction.

## Correctifs appliqués

| Gravité | Constat | Correctif |
|---|---|---|
| Haute | `addon_pronostics` absent des grants de colonnes de `organizations` | Grant explicite dans `00023` |
| Haute | Course entre contrôle du coup d'envoi et upsert | RPC verrouillée et horloge PostgreSQL |
| Haute | Résultat puis mises à jour de points séquentielles, donc classement partiel possible | Résultat et scoring atomiques |
| Haute | Changer le barème ne recalculait pas les résultats existants | Recalcul transactionnel de tous les matchs terminés |
| Haute | Relations contest/match/player/prediction non protégées contre un croisement de tenant | Uniques et FK composites validées |
| Haute | Un éditeur pouvait lire emails, téléphones, jetons et grilles | RLS owner-only et révocation des mutations directes |
| Haute | Un client PostgREST pouvait contourner les RPC en mettant à jour résultat ou scoring | Grants de colonnes et RPC `SECURITY DEFINER` bornées |
| Moyenne | Aucune preuve de consentement ni purge RGPD des joueurs | Case obligatoire, colonne dédiée, affichage consenti et purge par rétention |
| Moyenne | Données email/téléphone injectables même si la collecte était désactivée | Minimisation depuis la configuration serveur |
| Moyenne | Limites par IP trop basses pour le Wi-Fi partagé d'un commerce | Seuil réseau large + limite fine par joueur + Turnstile |
| Moyenne | Décocher email/téléphone n'enregistrait pas `false` | Marqueur de formulaire explicite |
| Moyenne | Fuseau public figé à Paris et rendu dashboard dépendant du serveur | Fuseau IANA de l'organisation passé au rendu |
| Moyenne | Addon sans contrôle d'activation dans le back-office | Action RBAC fraîche, contrôle UI et audit |
| Basse | Zone de silence QR de deux modules | Quatre modules |
| Basse | Rognages vidant une image et IDs de calques dupliqués acceptés | Raffinements Zod et tests |
| Basse | `/poster` omis des routes CSP à nonce | Ajout au proxy sensible |
| Outillage | `.env.example` référencé mais absent et lint pollué par `Input/` | Modèle sans secrets, exception Git et ignore ESLint ciblé |

## Points restant à traiter

### Priorité 1 — avant trafic public important

1. Fait pour l'essentiel : E2E Pronostics en CI (e2e/pronostics.spec.ts,
   seed E2EPRONO) — inscription, prono avant coup d'envoi, verrouillage
   après coup d'envoi, résultat/points et classement. Restent à couvrir :
   Turnstile réel (désactivé en E2E), correction de résultat et changement
   de barème.
2. Fait : classement agrégé en SQL (RPC `contest_leaderboard` — totaux,
   rangs ex æquo, compteurs, pgTAP) ; la page publique n'affiche que le
   top 50 + la position du joueur courant (`contest_player_rank`), le
   dashboard est paginé par 50.
3. Fait : récupération par lien magique (« Retrouver mes pronostics » sur la
   page publique) — jeton haché à usage unique (30 min), réponse neutre sans
   oracle d'inscription, double rate limit (IP et email ciblé), rotation du
   jeton appareil à la confirmation (anciens appareils déconnectés),
   journalisation dans audit_logs (ADR-014). Suppose la collecte d'email
   activée sur le championnat.
4. Définir un plafond métier de participants par championnat et une stratégie
   de charge pour les événements dépassant la clientèle d'un seul commerce.

### Priorité 2 — qualité produit et exploitation

1. Fait : fournisseur sportif branché (`syncContestFixtures` importe matchs,
   reports et résultats), cron nocturne `sync-contests`, cache partagé
   `fixture_cache` (une paire d'appels fournisseur par compétition),
   synchro paresseuse en fin de match et bouton « Synchroniser » du
   dashboard. Seul le mode match libre reste manuel, par conception.
2. Ajouter export des joueurs/gagnants, attribution réelle des récompenses et
   historique de remise. Le système annonce les récompenses mais ne suit pas
   leur consommation.
3. Tester physiquement les presets QR sur iOS/Android, impression laser et
   lumière faible. Le contraste est contrôlé, mais les motifs et logos exigent
   une matrice de qualification réelle.
4. Sortir les images d'affiche du JSONB vers Storage. La borne de 3 Mo protège
   la base mais reste coûteuse en lecture/écriture et en historique PostgreSQL.
5. Auto-héberger ou charger à la demande les 28 polices de l'éditeur. Le lien
   Google Fonts global augmente le temps d'ouverture et crée une dépendance
   réseau au moment de l'impression.
6. Fait : audits commerçant journalisés en transaction (migration
   `20260719040000`) — `contest.delete`, `contest.match.delete`,
   `contest.result.set`, `contest.result.correct` et
   `contest.scoring.update` écrits dans `audit_logs` avec avant/après.

## Vérifications exécutées

- `npm run typecheck` : succès.
- `npm run lint` : succès.
- `npm test` : 202 tests, 24 fichiers, tous au vert.
- `npm run build` : succès, collecte/génération des 37 entrées terminée et
  routes Pronostics dynamiques correctement détectées.
- `npm audit --audit-level=moderate` : 0 vulnérabilité racine.
- `npm audit --prefix site --audit-level=moderate` : 0 vulnérabilité vitrine.
- `npm run test:e2e` : commande saine, 3 tests existants ignorés faute de
  `E2E_BASE_URL`/`E2E_PLAY_SLUG`.
- Audit pgTAP enrichi pour les ACL/FK/RPC Pronostics. Non exécuté sur cette
  machine car Docker n'y est pas installé ; le job `database-security` de CI
  est le contrôle obligatoire avant déploiement.

## Ordre de déploiement

1. Sauvegarder la base et appliquer `00022`, puis `00023`.
2. Exécuter `supabase test db supabase/tests/security_acl.test.sql` sur la base
   locale de CI.
3. Déployer ensuite le code Next.js, qui dépend des nouvelles RPC et de la
   colonne `accepted_terms`.
4. Configurer Turnstile, `ADMIN_HOSTS`, les secrets et le cron de purge ;
   vérifier `/api/health`.
5. Activer l'addon depuis `/admin/merchants/[id]` seulement après le test E2E
   staging du commerçant pilote.
