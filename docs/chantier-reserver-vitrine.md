# Chantier — Train « Réserver & Vitrine »

## Objectif

Livrer LastChance Réserver (RES-1..5) et la Vitrine (VIT-1..5), plus les
Expériences Signature, Duo Miroir et Portrait de la Bande, tels que définis
dans le cahier produit [`docs/lastchance-reserver.md`](./lastchance-reserver.md).
19 lots (L0→L18), plan validé par le propriétaire le **2026-08-19**.

Les arbitrages A1-A4, la décision de traduction et la décision sur les packs
de questions sont consignés dans **ADR-109** (`docs/decisions.md`).

## Ordre permanent du propriétaire

Exécution autonome complète : chaque lot est développé, vérifié, poussé et
fusionné sans validation intermédiaire du propriétaire. Bilan global produit
en fin de train. Règle de cadence héritée du socle opérationnel (AGENTS.md/
CLAUDE.md) : au plus 2 trains d'écriture en vol, jamais 2 lots à migration en
parallèle, fusions de migrations sérialisées.

## Suivi des lots

| Lot | Contenu court | Statut | PR | Migration |
|---|---|---|---|---|
| L0 | Cadrage documentaire (ADR, roadmap, handoff, tracker) | ✅ | #156 | — |
| L1 | Benchmark Mennoo (lecture seule) → [`docs/benchmark-mennoo.md`](./benchmark-mennoo.md) | ✅ | #156 | — |
| L2 | Droit serveur vitrine (entitlement A1) | ✅ | #157 | 20261001120000 |
| L3 | RES-1a — schéma + RPC réservation | ✅ | #159 | 20261002120000 |
| L4 | RES-1b — surfaces + email (A2) | ✅ | #160 | — |
| L5 | RES-2 — liste prioritaire + invitations | ✅ | #161 | 20261004120000 |
| L6 | RES-3 — file sereine | ✅ | #162 | 20261005120000 |
| L7 | RES-4 — attente active | ✅ | #163 | 20261006120000 |
| L8 | Expériences Signature | ✅ | #164 | 20261007120000, 20261008120000, 20261009120000 |
| L9 | RES-5 — hold stock + RESA- + Drop | ✅ | #165 | 20261010120000 |
| L10 | VIT-1a — marque + catalogue FR (sous drapeau) | ✅ | #166 | 20261011120000 |
| L11 | VIT-1b — infra i18n + adaptateur neutre (**Vitrine OUVERTE au public**, ISR 60 s, sélecteur ≥95 %) | ✅ | #167 | 20261012120000 |
| L12 | VIT-2 — import assisté (revue obligatoire, RPC atomique) + QR contextuels par ancres | ✅ | #168 | 20261013120000 |
| L13 | VIT-3 — portes Réserver/quiz publiées en **opt-in** (blocs 5→7, purge sur drapeaux, acteur d'import) | ✅ | #169 | 20261014120000 |
| L14 | VIT-4 — À la une (3 contenus), audience (beacon vitrine), segments réservé/venu | ✅ | #170 | 20261015120000 |
| L15 | VIT-5 — langues+ | ⏳ | — | — |
| L16 | Socle session joueur | ⏳ | — | — |
| L17 | Duo Miroir (A4) | ⏳ | — | — |
| L18 | Portrait de la Bande (A4, packs de questions) | ⏳ | — | — |

Légende : ⏳ à faire · 🔨 en cours · ✅ fusionné.

Hors lots — **Flake E2E ✅ #158** : correction d'une instabilité de la suite
Playwright rencontrée pendant le train. Elle n'appartient à aucun lot et ne
porte aucune migration ; elle figure ici parce qu'elle occupe un numéro de PR
de la série et qu'un trou dans la numérotation se relit, six mois plus tard,
comme une PR perdue.

Note L4 : `PageOpenBeacon` non posé sur `/reserver` (`ModulePageOpenKey` à
étendre — analytics VIT-4).

Note L4 (revue de sécurité, correctifs appliqués) :

- **Turnstile — clés de production à poser AVANT l'ouverture commerçant.**
  C'est une **condition de la revue**, pas une amélioration : le challenge
  anti-Sybil n'est opposé que si `TURNSTILE_SECRET_KEY` **et**
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` sont configurées (motif `finishQuiz` — sans
  clé publique, l'écran n'aurait aucun widget et le refus serait sans issue pour
  le joueur). Sans elles, `reserveSlot` — le seul appel émetteur du parcours —
  n'oppose **aucune** friction : un bot muni de cookies jetables peut vider un
  créneau sans jamais venir, et le commerçant prépare pour vingt personnes qui
  n'existent pas. Les invariants SQL bornent le **nombre** de places, pas la
  **diversité** des mains qui les prennent.
- **Migration `20261003120000`** — `cancel_reservation_staff` : le commerçant
  peut enfin libérer une place (aucun geste ne le permettait, `cancel_reservation`
  exigeant l'empreinte du cookie joueur et `reservations` n'ayant aucun grant
  `update`). Org-scopée, acteur vérifié `owner`/`editor` en SQL, auditée sous
  `reservation.cancel_staff`, même verrou d'avis que `reserve_slot`.

Note L5 : pas d'email d'offre au MVP (découverte par la page) ; pas de
retrait staff d'une file (suites).

Note L5/L6 : arbitrages RES-2 (capacité, offre séquentielle, plafond de
file, jeton d'invitation) et RES-3 (rang calculé à la lecture, aucun worker
d'expiration, purge datée au dernier instant connu) consignés dans
ADR-110 et ADR-111 (`docs/decisions.md`). Résidus assumés (plafond de file
vs cumul, `getQueuePublicState` sans cookie, seau comptoir, Turnstile
production) listés dans `docs/bugs.md`, section Notes.

ADR-110/111 écrites ; handoff Codex sera mis à jour au bilan (modification
concurrente à préserver).

L8 — QA (`e2e/reserver-signature.spec.ts`, PR #164) a trouvé deux bugs
produit réels, tous deux corrigés dans le même lot : `is_valid_experience_steps`
(fonction de `check` sur `reservation_activities`) n'avait pas l'`EXECUTE`
nécessaire à `authenticated` — toute création/édition d'un Moment Signature
échouait en `permission denied` (migration 20261008120000) ; la case « Activité
ouverte aux réservations » postait `value="on"`, un enum invalide pour
`caseACochee` — tout enregistrement des réglages d'activité avec la case
cochée échouait silencieusement (`activite-reglages-form.tsx`, corrigé en
`value="true"`). Les deux étaient présents avant ce lot (le premier depuis
20261007120000, le second depuis L4) et n'avaient jamais été exercés par un
E2E jusqu'ici. Arbitrage L8 (capacité en personnes, format gelé par trigger,
grant EXECUTE épinglé) : ADR-113.

L9 — RES-5, PR #165, migration `20261010120000` : offres de stock réel
(`reservation_stock_offers` / `reservation_stock_holds`), restant dérivé sous
verrou d'avis, code `RESA-` en 10e famille du registre universel, deux bornes
de retrait gravées sur la prise, pont d'identité conditionné à la
servabilité. Arbitrage complet : ADR-114. **Le périmètre Réserver (RES-1 à
RES-5, L0 à L9) est complet.**

**Bascule Vitrine** : à partir de L10, le train quitte Réserver pour la
Vitrine (VIT-1a, catalogue commerce/cartes/rubriques/fiches), migration
`20261011120000`, branche `chantier/rv-l10-vitrine-catalogue`.

## Notes de mise à jour

Ce fichier est mis à jour à chaque lot : statut, numéro de PR, migration
associée le cas échéant. Le bilan global du train sera ajouté en fin de
liste une fois L18 fusionné.
