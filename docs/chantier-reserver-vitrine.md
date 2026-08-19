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
| L4 | RES-1b — surfaces + email (A2) | 🔨 QA | #160 | — |
| L5 | RES-2 — liste prioritaire + invitations | ⏳ | — | — |
| L6 | RES-3 — file sereine | ⏳ | — | — |
| L7 | RES-4 — attente active | ⏳ | — | — |
| L8 | Expériences Signature | ⏳ | — | — |
| L9 | RES-5 — hold stock + RESA- + Drop | ⏳ | — | — |
| L10 | VIT-1a — marque + catalogue FR (sous drapeau) | ⏳ | — | — |
| L11 | VIT-1b — infra i18n + adaptateur neutre (ouverture publique Vitrine) | ⏳ | — | — |
| L12 | VIT-2 — import assisté + QR imprimables | ⏳ | — | — |
| L13 | VIT-3 — branchement | ⏳ | — | — |
| L14 | VIT-4 — social + avis + analytics + CRM léger | ⏳ | — | — |
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

## Notes de mise à jour

Ce fichier est mis à jour à chaque lot : statut, numéro de PR, migration
associée le cas échéant. Le bilan global du train sera ajouté en fin de
liste une fois L18 fusionné.
