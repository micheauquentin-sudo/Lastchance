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
| L15 | VIT-5 — écran de traduction (version vue bornée, acteur signé) ; langues+ = extension documentée | ✅ | #171 | 20261016120000 |
| L16 | Socle session joueur — salons 2-12, code court, TTL, kick, supervision commerçant (E-1 borné : voir `bugs.md` LOBBY-1) | ✅ | #172 | 20261017120000 |
| L17 | Duo Miroir — choix scellés, révélation simultanée, nom gravé au geste ; porte Vitrine ; Turnstile posé sur la création de salon (LOBBY-1 non armé) | ✅ | #173 | 20261018120000 |
| L18 | Portrait de la Bande — vote secret (plancher de 3 réponses), dénominateur figé, 5 packs livrés et gardés | ✅ | #174 | 20261019120000 |

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
associée le cas échéant.

## Bilan du train

Dix-neuf lots (L0→L18), tous fusionnés, PR #156 à #174, migrations
`20261001120000` à `20261019120000`. Réserver est complet (RES-1 à RES-5),
la Vitrine est complète (VIT-1 à VIT-5), et trois expériences joueur sont
livrées : Signature, Duo Miroir, Portrait de la Bande. Hors lots, PR #158
corrigeait un flake E2E rencontré en cours de route.

Le fait le plus utile de ce bilan n'est pas la liste des livraisons : c'est
ce que la vérification a trouvé et que la lecture n'avait pas vu.

- **L11** : l'ISR n'existait pas. `export const revalidate = 60` sans
  `generateStaticParams` laisse la route dynamique en Next 16 — prouvé par
  `.next/prerender-manifest.json` (`fallback: null`), pas par relecture du
  code.
- **L8** : `is_valid_experience_steps` n'avait pas l'`EXECUTE` pour
  `authenticated` — toute création de Moment Signature échouait en
  `permission denied` — et une case à cocher postait `value="on"`, un enum
  invalide, faisant échouer silencieusement l'enregistrement. Les deux
  préexistaient au lot et n'avaient jamais été exercés par un E2E.
- **L17** : une course de scrutin WebKit (un sondage parti avant
  `lockLobby` revenait après et écrasait l'état), fermée par un compteur de
  génération ; et un `<>` au lieu d'un `is distinct from` rouvrait le sceau
  d'un joueur dont le plat avait été supprimé — la contre-revue a montré que
  la garde n'était pas testée, en revenant au `<>` et en constatant 155/155
  encore verts.
- **L18** : l'hôte pouvait désanonymiser les votes un par un en révélant
  avant tout plancher de participation ; fermé par un plancher
  `least(3, dénominateur)`, un état `trop_tot`, et `votes_exprimes` rendu nul
  pour les non-votants.

Après le train (2026-08-21/22), hors lots :

- **Turnstile vérifié ARMÉ.** LOBBY-1 affirmait « non armé » sans que
  personne n'ait mesuré. La clé publique est prouvée dans le bundle de
  production ; détail, méthode et résidu dans `docs/bugs.md`.
- **`CRON_SECRET` absent des secrets GitHub** : la garde de santé
  post-déploiement fonctionne comme porte mais ne nomme jamais la cause d'un
  échec.
- **Deux révocations de clés propriétaire** (`rk_live_`, jeton Vercel)
  étaient tombées de `CLAUDE.md` quand l'entrée du train a remplacé celle du
  wagon 7 ; restaurées.
- **Le flake de la file d'accueil avait DEUX causes**, et la seconde comptait
  plus que la première (PR #175). La première était une fixture disputée :
  `mobile-chrome` et `mobile-safari` jouent `e2e/reserver-file.spec.ts` en même
  temps sur la même base et se partageaient une file unique, alors que l'état
  « appelé, pas encore servi » est un singleton par file — corrigée par une file
  par projet dans le seed (`File E2E WebKit`), pas par un durcissement de test
  supplémentaire. **La CI est alors repassée au vert, et le test échouait
  toujours en local** — immédiatement, de façon reproductible. L'instantané de
  Playwright a donné la vraie cause : la région ouverte n'était pas la nôtre
  mais celle de la première file de l'organisation, qui est vide, d'où l'absence
  totale du bouton « Appeler le suivant ». Un **clic parti avant l'hydratation**
  ne fait rien : le bouton est déjà peint par le rendu serveur, donc actionnable
  au sens de Playwright, mais aucun gestionnaire React n'y est encore attaché.
  Aucun `waitForLoadState` ne couvre cela — le réseau est calme bien avant que
  React soit prêt. Le remède est de ne plus croire le clic : `ouvrirOngletFile()`
  reclique tant que le panneau attendu n'est pas ouvert.

  **La leçon de méthode vaut plus que le correctif** : la CI verte après la
  première cause aurait suffi à clore le sujet. C'est la machine **lente** qui a
  rendu la seconde visible, parce qu'elle élargit la fenêtre où le défaut existe.
  Quand un flake résiste, reproduire en local sous charge vaut mieux que relancer
  la CI. Preuve retenue : deux exécutions concurrentes consécutives, 10 tests
  passés chacune, là où la précédente tombait.

**Traduction (arbitrage produit).** Aucun fournisseur n'est câblé :
adaptateur neutre et repli français, la traduction se fait par l'écran
commerçant (VIT-5). Mesure : ~2 000 caractères traduisibles par Vitrine en
hypothèse prudente (médiane réelle d'un échantillon de 10 cartes : ~270
mots / ~1 800 caractères). Le quota gratuit de 500 000 caractères/mois de
Google Cloud Translation couvrirait donc environ **250 commerces par mois
et par langue cible** si un fournisseur était câblé plus tard. Détail :
`docs/vitrine-traduction-benchmark-2026-08-19.md`.

**Reste ouvert** : `CRON_SECRET` ; aucun mécanisme de présence dans les
salons (l'hôte clôt chaque question) ; `robots: index false` sur la Vitrine
(décision de commerce) ; les 5 packs de questions attendent la relecture du
propriétaire ; les deux révocations de clés.
