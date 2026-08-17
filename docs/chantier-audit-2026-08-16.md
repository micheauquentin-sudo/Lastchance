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
| 2 | Le catalogue Stripe dit vrai | `chantier/audit-p0-stripe` | SD-1..SD-7, SD-9, SD-4 (périmètre) | **PR ouverte, CI en cours** |
| 3 | La boucle joueur → gain se ferme | `chantier/audit-p0-joueur` | JOU-1, UI-1, UI-2, JOB-8, SEC-2 (skill), MORT-1 (écran jackpot) | à venir |
| 4 | Le commerçant garde la main, les chiffres disent vrai | `chantier/audit-p1-controle` | FIA-1..FIA-6, EXP-3, NUM-1, SCAN-1, LIST-1, IDX-1, CNT-1, EXP-2 (hero) | à venir |
| 5 | La soirée live tient sa promesse | `chantier/audit-p1-live` | EVT-1, EVT-2, JOU-4, JOU-5, DOC-1 (perf-report), JKP-1, plafond jauge 500 | à venir |
| 6 | Léger, accessible, des états partout | `chantier/audit-p2-front` | PERF-1..PERF-8, PERF-4/UI-3, UI-4, UI-5, UI-6, A11Y-1..A11Y-7 (+ le correctif de contraste en `stash@{0}` du clone WSL) | à venir |
| 7 | Les capteurs disent vrai, le fond tient | `chantier/audit-p2-fond` | JOB-1..JOB-7, JOB-9, SEC surface (seaux, timing-safe, health, wallet), SEC multitenant (fixture 2 orgs, RLS par catalogue, privilèges par défaut), CI-1, CI-2, TEST-1..TEST-3, DETTE-1, DETTE-2, MORT-2 | à venir |

**Méthode par wagon** : DB d'abord (commit + `verif-complete.sh --db-seul`),
backend + frontend en parallèle sur dossiers disjoints, `qa-verify` +
`security-review` en parallèle, `docs-scribe`, PR, boucle babysit-CI
(CI verte sur le SHA de tête → squash → santé post-déploiement), wagon suivant.
Chaque correctif embarque un test qui échoue sans lui. Versions et ADR
attribués à l'ouverture de la PR, jamais avant.

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
- **Wagon 2** : `e65b1b9` sur `chantier/audit-p0-stripe`, PR à ouvrir. Revue
  sécurité première passe NO-GO (1 ÉLEVÉ, 2 MOYEN, 1 FAIBLE, 4 INFO), les
  quatre corrigés dans le wagon, contre-vérification **GO** — reliquats en
  INFO dans `docs/bugs.md`. pgTAP 60 fichiers / 3493 assertions (vide et
  semée), typecheck/lint/build verts, E2E local WSL `mobile-chrome` 39
  passed / 6 skipped. Roadmap V1.58, ADR-103. CI GitHub : non exécutée à
  l'heure d'écrire cette ligne, la PR la jouera.
