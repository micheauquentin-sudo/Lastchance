# Train de correction — audit transverse du 2026-08-16

**Source** : [`docs/audit-transverse-2026-08-16.md`](./audit-transverse-2026-08-16.md)
(99 constats, 94 confirmés — 2 P0, 11 P1, 43 P2, 38 P3).
**Ordre du propriétaire (2026-08-16)** : tout régler en un seul train, sans
relance ; chaque PR verte est fusionnée sur `main` (ordre permanent) et le
wagon suivant s'enchaîne. Ce fichier est le suivi : il est mis à jour à chaque
fusion, le propriétaire n'a rien d'autre à surveiller.

## Les quatre arbitrages produit (tranchés par le propriétaire, 2026-08-16)

1. **Jackpot mode staff** → écrire l'écran caisse manquant (calqué sur le
   tampon fidélité), pas de retrait du mode.
2. **Réflexe & Jauge** → durcir (trou du 0 ms fermé, plancher réaliste, limite
   de débit) + mention honnête dans l'atelier ; les jeux restent.
3. **Gain non réclamé** → la reprise couvre toute la fenêtre de rejeu et
   s'affiche d'elle-même au retour ; pas d'émission au registre à ce stade.
4. **Périmètre add-on** → application de la décision du 2026-08-04 : un pass
   n'ouvre QUE son module ; la roue/campagnes ne s'ouvrent que par une offre.

## Le train

| # | Wagon | Branche | Contenu (IDs de l'audit) | État |
|---|---|---|---|---|
| 1 | Rien ne sort qui ne doive sortir | `chantier/audit-p0-sorties` | NEWS-1, SEC-1 (audit_logs), TOK-1, IP-1, RET-1, DOC-1 privacy | ✅ **fusionné `585d0e7`, déployé, santé verte** |
| 2 | Le catalogue Stripe dit vrai | `chantier/audit-p0-stripe` | SD-1..SD-7, SD-9, SD-4 (périmètre) | ✅ **fusionné `7db27ee`, déployé, santé verte** |
| 3 | La boucle joueur → gain se ferme | `chantier/audit-p0-joueur` | JOU-1, UI-1, UI-2, JOB-8, SEC-2 (skill), MORT-1 (écran jackpot) | ✅ **fusionné `4b9499b`, déployé, santé verte** |
| 4 | Le commerçant garde la main, les chiffres disent vrai | `chantier/audit-p1-controle` | FIA-1..FIA-6, EXP-3, NUM-1, SCAN-1, LIST-1, IDX-1, CNT-1, EXP-2 (hero) | ✅ **fusionné `c32dfc4`, déployé, santé verte** |
| 5 | La soirée live tient sa promesse | `chantier/audit-p1-live` | EVT-1, EVT-2, JOU-4, JOU-5, DOC-1 (perf-report), JKP-1, plafond jauge 500 | ✅ **fusionné `4b614b8`, déployé, santé verte** |
| 6 | Léger, accessible, des états partout | `chantier/audit-p2-front` | PERF-1..PERF-8, PERF-4/UI-3, UI-4, UI-5, UI-6, A11Y-1..A11Y-7 | ✅ **fusionné `4016a8e`, déployé, santé verte** |
| 7 | Les capteurs disent vrai, le fond tient | `chantier/audit-p2-fond` | JOB-1..JOB-7, JOB-9, SEC surface (seaux, timing-safe, health, wallet), SEC multitenant (fixture 2 orgs, RLS par catalogue, privilèges par défaut), CI-1, CI-2, TEST-1..TEST-3, DETTE-1, DETTE-2, MORT-2 | ✅ **code complet, QA verte, sécu GO, PR en ouverture** |

**Méthode par wagon** : DB d'abord (commit + `verif-complete.sh --db-seul`),
backend + frontend en parallèle sur dossiers disjoints, `qa-verify` +
`security-review` en parallèle, `docs-scribe`, PR, boucle babysit-CI
(CI verte sur le SHA de tête → squash → santé post-déploiement), wagon suivant.
Chaque correctif embarque un test qui échoue sans lui. Versions et ADR
attribués à l'ouverture de la PR, jamais avant.

## Coordination entre sessions — 2026-08-17

**Deux sessions travaillent en même temps, dans le même arbre Windows**
(`C:\Users\MISHOW\Documents\LastChance\Lastchance`). Ce n'est pas un problème de
branches : c'est un problème de **ressources uniques**.

| Session | Périmètre | Écrit ? |
|---|---|---|
| A | Wagon 3 — PR #150, boucle babysit-CI jusqu'à la fusion | oui, sur `chantier/audit-p0-joueur` |
| B | Wagon 4 — **brief d'exécution uniquement** | non : lecture seule, aucun code, aucune branche |

**Avant de démarrer l'écriture du wagon 4, lire
[`wagon-4-brief.md`](./wagon-4-brief.md)** (rendu le 2026-08-17) : les 13
constats y sont cartographiés puis **contre-vérifiés une seconde fois dans
l'arbre du jour**, avec les chemins exacts, le découpage en lots disjoints par
agent et les frontières entre lots.

Deux résultats de cette contre-vérification, à connaître avant d'ouvrir quoi que
ce soit :

1. **Aucun constat n'est tombé** — 12 TIENT, 1 PARTIEL (FIA-2), 0 déjà corrigé.
   Le wagon 4 garde son périmètre entier. Ce sont les **chemins** de l'audit qui
   ont bougé, pas les défauts : six références de
   `docs/audit-transverse-2026-08-16.md` pointent une définition morte ou un
   défaut inexistant (détail en section « Corrections à l'audit » du brief).
   Suivre l'audit à la lettre ferait éditer du SQL qui n'est plus en vigueur —
   `run_campaign_schedule` (FIA-3) et `set_contest_status` (FIA-2) ont été
   redéfinies par le wagon 2.
2. **Les trois arbitrages structurants sont tranchés** (propriétaire,
   2026-08-17) : FIA-2 → gardes **applicatives** + ADR qui l'assume, la branche
   SQL est écartée ; FIA-3 → **branche A**, `set_campaign_status` désarme
   `auto_schedule` ; NUM-1 → **dater les clés**, rupture de série assumée et
   écrite en tête de migration. Ils sont consignés en tête du brief et **ne se
   rejouent pas**.
3. **Quatre arbitrages bloquants restent ouverts** (questions 2, 4, 6 et 7 du
   brief : périmètre du prédicat campagne, refus sec ou surmontable sur FIA-5,
   valeur du plafond de page, RPC de comptage ou motif `events`). **L'écriture
   des lots concernés ne commence pas avant réponse** : un fan-out sur un
   arbitrage en suspens multiplie la mauvaise réponse par N au lieu de la
   corriger une fois.

**La règle des ressources uniques**, apprise aux pièges 9 et 12 du CLAUDE.md :
une seule stack Supabase locale, un seul cache Vitest par arbre, un seul `.next`
dans le clone WSL. **Jamais deux campagnes de vérification en parallèle** — un
`supabase db reset` lancé pour un wagon détruit le pgTAP ou l'E2E de l'autre, et
deux Vitest concurrents rendent « 261 fichiers, no tests » sur une suite verte.
Tant que la session A tient la CI de la PR #150, la session B ne lance ni test,
ni build, ni migration : elle lit.

**Wagon 4 : l'écriture ne commence qu'après la fusion du wagon 3**, sur une
branche partie de `main` à jour. Les deux wagons se croisent sur les fichiers de
couture — `src/lib/release.ts` (`EXPECTED_MIGRATION` + version),
`src/types/database.generated.ts`, `.github/workflows/ci.yml`, les `docs/` — où
partir d'un `main` en retard fabrique un conflit gratuit.

## Hors périmètre du train (constaté, non traité ici)

- Les 4 INCERTAINS de l'audit (Wallet Apple sans certificats provisionnés,
  sonde d'uptime externe, portail Stripe côté dashboard, mentions légales de
  repli) : dépendent d'un état de production illisible depuis le dépôt.
- Gestes propriétaire hérités : révoquer `rk_live_`, le jeton Vercel ;
  Brevo/STOP/AF2M ; prix Stripe des packs SMS.
- Place de marché, Méta-progression, Registre universel : non audités en
  profondeur (angle mort 9) — un audit dédié après le train si souhaité.
- Angle mort 10 : une demi-journée de parcours guidé réel sur l'organisation
  de test, après le train.

## Journal des fusions

*(rempli à chaque wagon fusionné : PR, squash SHA, CI main, santé, version)*

- **Wagon 1 (PR #146)** : CI 11/11 verte, revue sécurité GO (2 MOYEN/1
  FAIBLE/3 INFO — MOYEN 2, FAIBLE 3, INFO 4 et 6 fermés avant fusion ; MOYEN 1
  documenté en ADR-102 ; INFO 5 consigné dans `docs/bugs.md`). pgTAP 59
  fichiers / 3372 assertions, `verif-complete.sh --rapide` 0 échec, E2E local
  `mobile-chrome` passed. Roadmap V1.57. **Fusion squash `585d0e7` le
  2026-08-16 ; CI `main` success ; « Santé après déploiement » success —
  migration `20260924120000` appliquée en production.**
- **Wagon 2 (PR #149)** : CI de la PR verte sur le SHA de tête `68343a7` (6
  jobs). Revue sécurité première passe NO-GO (1 ÉLEVÉ, 2 MOYEN, 1 FAIBLE, 4
  INFO), les quatre corrigés dans le wagon, contre-vérification **GO** —
  reliquats en INFO dans `docs/bugs.md`. pgTAP 60 fichiers / 3493 assertions
  (vide et semée), typecheck/lint/build verts, E2E local WSL `mobile-chrome`
  39 passed / 6 skipped. Roadmap V1.58, ADR-103. **Fusion squash `7db27ee`
  sur l'ordre permanent ; CI `main` success sur `7db27ee` ; « Santé après
  déploiement » success sur `7db27ee`, job « Base · Workers · Sécurité »
  réellement exécuté (13:11:49→13:12:00 UTC, pas sauté) — migrations
  `20260925120000` et `20260926120000` appliquées en production.**
- **Wagon 3** : branche `chantier/audit-p0-joueur` poussée, tête `65c25e5`,
  arbre propre, 11 commits. Revue sécurité **GO** (0 critique/élevé, 3 MOYEN
  + 1 FAIBLE + 5 INFO, les 3 MOYEN et l'INFO-1 fermés avant PR). pgTAP 61
  fichiers / 3522 assertions (vide et semée), typecheck/lint/build verts,
  E2E local WSL — spec caisse jackpot staff neuve verte, non-régression
  verte, `wheel-wizard` 23/23 en run isolé. Roadmap V1.59, ADR-104. **PR #150
  ouverte puis verte sur le SHA de tête `0d70e83` (l'unique rouge du parcours,
  deux casts de test sans justification pour `casts:check`, corrigé en
  `0d70e83`). Fusion squash `4b9499b` sur l'ordre permanent le 2026-08-17 ;
  CI `main` success sur `4b9499b` ; « Santé après déploiement » success, job
  « Base · Workers · Sécurité » réellement exécuté (16:53:53→16:54:00 UTC,
  pas sauté) — migration `20260927120000` appliquée en production.**
- **Wagon 4 (PR #151)** : CI de la PR intégralement verte sur le SHA de tête
  `bc5e209`. Revue sécurité **GO** (0 critique/élevé, 1 MOYEN + 2 FAIBLE + 7
  INFO, le MOYEN et 1 FAIBLE fermés dans le wagon). pgTAP 62 fichiers / 3561
  assertions PASS ×2 (vide et semée), typecheck/lint/build verts, Vitest
  complet vert, E2E ciblé WSL `mobile-chrome` (dashboard-home,
  atelier-modules, wheel-wizard, campaign-templates, event) 41 passed / 3
  skipped / 0 failed. Roadmap V1.60, ADR-105. **Fusion squash `c32dfc4` sur
  l'ordre permanent le 2026-08-17 ; CI `main` success sur `c32dfc4` ; « Santé
  après déploiement » success sur `c32dfc4`, job « Base · Workers ·
  Sécurité » réellement exécuté (20:13:34→20:13:42 UTC, pas sauté) —
  migration `20260928120000` appliquée en production.**
- **Wagon 5 (PR #152)** : branche `chantier/audit-p1-live`, tête `f48b83d`,
  11 commits. Revue sécurité **GO** (0 critique/élevé, 2 MOYEN + 1 FAIBLE +
  5 INFO, les 2 MOYEN, le FAIBLE et 1 INFO fermés dans le wagon). pgTAP 63
  fichiers / 3614 assertions PASS ×2 (vide et semée), `verif-complete.sh
  --rapide` 0 échec (6 min 29), E2E ciblé 57/57 verts sur 3 navigateurs
  (event, jackpot, jackpot-staff-checkin, player-win, wheel-wizard). Roadmap
  V1.61, ADR-106. **CI de la PR intégralement verte sur le SHA de tête
  `cd8e8c9` (6 jobs). Fusion squash `4b614b8` sur l'ordre permanent le
  2026-08-18 ; CI `main` success sur `4b614b8` ; « Santé après déploiement »
  success sur `4b614b8`, job « Base · Workers · Sécurité » réellement
  exécuté (09:12:36→09:12:46 UTC, pas sauté) — migration `20260929120000`
  appliquée en production.**
- **Wagon 6** : branche `chantier/audit-p2-front`, tête `ad7600f` poussée,
  ~19 commits, arbre propre hors `docs/lastchance-reserver.md` (Codex, non
  suivi, hors commit). Revue sécurité **GO** (consentement analytics durci,
  deux frontières d'erreur préexistantes qui avalaient déjà leurs erreurs en
  silence réparées en bonus). pgTAP 63 fichiers / 3614 assertions inchangé
  (aucune migration), `verif-complete.sh --rapide` 13/13 vert, E2E ciblé
  `mobile-chrome` 9 specs vertes au global (3 rouges du premier passage
  expliquées : 2 faux positifs dégradé couverts par `ad7600f`, 1 flake
  wheel-wizard rejoué 5/5 vert). Bundle mesuré avant/après sur 4 pages
  (`scripts/mesurer-bundle.mjs`). Roadmap V1.62, ADR-107. **AUCUNE migration.
  CI de la PR #153 verte sur le SHA de tête `736472f` après trois tours
  d'épluchage a11y (35 indécidables → arbitrage compté+attaché non bloquant,
  exclusions retirées ; 2 vraies violations réparées — `/login` et 8 sites
  `text-orange-600` brut ; puis balayage complet des participations, cause
  racine identifiée : le dashboard vit sur fond crème, `text-zinc-500` y fait
  4,48:1). Fusion squash `4016a8e` sur l'ordre permanent le 2026-08-18 ; CI
  `main` success sur `4016a8e` ; « Santé après déploiement » success sur
  `4016a8e`, job réellement exécuté (15:01:04→15:01:11 UTC, pas sauté) —
  aucune migration à appliquer.**
- **Wagon 7** : branche `chantier/audit-p2-fond`, tête `3f53691`, 26 commits
  depuis `main`, arbre propre hors `docs/lastchance-reserver.md` (Codex, non
  suivi, hors commit). Revue sécurité **GO** (0 critique/élevé, 2 MOYEN + 2
  INFO, tous fermés dans le wagon — M1 période `jackpot-draws`, M2 double
  borne newsletter, I1 garde proxy de confiance, I2 `CRON_SECRET` dans le
  workflow). pgTAP 64 fichiers / 3566 assertions PASS ×2 (vide et semée),
  `verif-complete.sh` 0 échec (11 min), E2E complet vert (2 flakes de charge
  WebKit tranchés par rejeu isolé vert), typecheck/lint/casts 0. Migration
  `20260930120000_le_fond_tient.sql`. Roadmap V1.63, ADR-108. **✅ Fusionné,
  déployé, santé verte.** PR #154, tête finale `efaecd0` (32 commits) : la CI
  y a exigé quatre gestes de plus, tous sur les E2E neufs — collision de
  fixtures event résolue par session dédiée `E2ERMT` (`8d34a06`), jauge
  jackpot en assertion relative (`c7feb86`), `calendar:136` re-fixme
  documenté (`181adb1`), et la vraie cause de la cascade : **le test
  télécommande mutait sa session sans jamais la rendre — un `beforeEach` la
  remet en lobby, les retries CI redeviennent efficaces** (`efaecd0`).
  Fusion squash `d170a65` sur l'ordre permanent le 2026-08-19 ; « Santé
  après déploiement » success sur `d170a65`, job réellement exécuté
  (22:04:47→22:04:58 UTC, pas sauté) — migration `20260930120000` appliquée
  en production (contrôle `EXPECTED_MIGRATION` de la sonde). CI `main` :
  E2E tombé au premier passage sur la roulette de contention PRÉEXISTANTE
  (pronostics, wheel-wizard, pronostics-generic — aucun spec du wagon, même
  trio que la fusion `da013c2` d'avant le wagon), rerun lancé ; dette de
  stabilité consignée dans `docs/bugs.md`.
