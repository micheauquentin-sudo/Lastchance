# Brief d'exécution — wagon 4 : « Le commerçant garde la main, les chiffres disent vrai »

> **Statut du document** : ordre de mission. Les 13 constats ont été cartographiés puis **contre-vérifiés une seconde fois dans l'arbre du 2026-08-17**, après les wagons 1 (`585d0e7`), 2 (`7db27ee`) et 3 (PR #150, non fusionnée). Chaque chemin:ligne ci-dessous a été relu. Aucun agent d'écriture ne doit rouvrir une phase de découverte.
>
> **Branche** : `chantier/audit-p1-controle`, partie d'un `main` **incluant la fusion du wagon 3**. Ce n'est pas une préférence : `supabase/migrations/20260927120000_boucle_joueur_gain.sql` et `src/lib/release.ts:12` (`EXPECTED_MIGRATION = "20260927120000"`, vérifié) n'existent aujourd'hui que sur `chantier/audit-p0-joueur` — `git log origin/main` s'arrête à `d1a41ab` / `7db27ee`. Partir avant la fusion fabrique un conflit gratuit sur les fichiers de couture (`docs/chantier-audit-2026-08-16.md:67-71`).

---

## Ce qui est déjà tranché

### Arbitrages du propriétaire (2026-08-16)

Les quatre arbitrages produit (`docs/chantier-audit-2026-08-16.md:10-19`) — jackpot mode staff, réflexe/jauge, gain non réclamé, périmètre add-on — **ne couvrent aucun des 13 constats de ce wagon**. Vérifié. Ne pas les invoquer pour trancher quoi que ce soit ici.

### Arbitrages du propriétaire (2026-08-17) — les trois structurants sont TRANCHÉS

Rendus après lecture du présent brief. **Ils ne se rejouent pas.** Les questions 1, 3 et 5 de la section « Questions ouvertes » sont closes par ce qui suit ; **les questions 2, 4, 6 et 7 ont été tranchées à leur tour le 2026-08-17 en fin de journée** (voir le tableau complémentaire ci-dessous), et les recommandations du brief sont adoptées pour les quatre non bloquantes (8 : oui pour les trois FK vérifiées seulement ; 9 : oui, `droit_expire` rejoint le prédicat ; 10 : dépublications laissées libres, dit dans le `comment on function` ; 11 : `live` seul en garde absolue).

| # | Décision | Ce qu'elle impose au wagon |
|---|---|---|
| **FIA-2** | **Gardes applicatives + ADR qui l'assume.** La branche SQL (`assert_module_publishable` appelée par les 8 RPC) est **écartée**. | FIA-2 reste `toucheSQL: false`, dans le **lot backend**, et ne remonte pas devant le lot DB. Le lot se limite aux **deux gardes métier manquantes**. L'ADR du wagon doit écrire noir sur blanc que la règle de publication vit dans l'application et pourquoi — sinon le constat rouvrira au prochain audit. La question ouverte n° 2 (périmètre du prédicat campagne) reste à trancher **avant** d'écrire ce lot. |
| **FIA-3** | **Branche A** : `set_campaign_status` désarme `auto_schedule` sur `paused`, `draft` et `archived`. La branche B (`paused_reason = 'manual'`) est **écartée**. | Aucune migration de contrainte, aucune valeur d'énumération, aucune 4ᵉ branche de bannière. L'écriture se fait dans le `create or replace` unique de `set_campaign_status` (lot DB), là où FIA-6 écrit déjà. Couvre aussi « Restaurer en brouillon ». |
| **NUM-1** | **Dater les clés d'idempotence**, rupture de série assumée. L'alternative additive (compteurs distincts, clés inchangées) est **écartée**. | La rupture doit être **écrite en tête de la migration** : avant, un `start` par joueur à vie ; après, un par joueur et par jour ; **aucun backfill possible** (`on conflict do nothing`, `20260805160000:424`). Les périodes antérieures et postérieures ne sont pas comparables — le dire aussi dans l'ADR et dans `docs/bugs.md`. |

**Conséquence produit de FIA-3 branche A, à assumer** : un commerçant qui met sa campagne en pause une heure devra **ré-armer la programmation à la main** dans « Programmation et budget ». Point mineur laissé ouvert, non bloquant : faut-il un raccourci de ré-armement depuis la carte Statut, ou la mention écrite suffit-elle ? *Recommandation : la mention suffit* — moins de surface, et le geste existe déjà à un écran de distance. **Adoptée : la mention suffit.**

| # | Décision (2026-08-17, fin de journée) | Ce qu'elle impose au wagon |
|---|---|---|
| **FIA-2 (q. 2)** | **Les deux gardes** : « aucun lot gagnant tirable » ET « poids total nul ». | Le prédicat campagne du lot backend couvre les deux promesses de l'écran (`controles.ts:82-83`) — l'écran et le serveur disent enfin la même chose. |
| **FIA-5 (q. 4)** | **Refus sec.** La confirmation cochable est écartée. | Pas de marqueur, pas de case, pas de 12ᵉ entrée au registre `destructive-confirm-coverage` — le compte reste à onze (EXP-3 seul l'incrémente). |
| **CNT-1 (q. 6)** | **Plafond constant de 500 pages, repli silencieux** au-dessus. | La même constante sert `parsePageParam` (5 écrans TS) et les bornes des deux RPC ; au-dessus, la page est ramenée au plafond sans message (convention du dépôt). |
| **LIST-1 (q. 7)** | **Motif `events`** (un `count exact head` par parent). La RPC de comptage groupé est écartée. | Aucun SQL LIST-1 dans la migration, aucune régénération de types, pas de `module_list_counts.test.sql` ; les quatre pages cassent leur `Promise.all` en deux `await` (coût assumé). |

### Limites de l'audit qui s'appliquent, et ce qu'elles interdisent d'écrire

- **Angle mort 8** (`docs/audit-transverse-2026-08-16.md`, section 6, point 8) : le `max_rows` du PostgREST **hébergé** n'a pas pu être lu ; `supabase/config.toml:8` est la configuration locale. **Conséquence contraignante pour LIST-1** : le volet « le compte affiché devient silencieusement faux au-delà de 1000 lignes » **n'est pas établi**. Le défaut retenu est **le transfert inutile de lignes, rien d'autre**. Interdit d'écrire dans le code, un commentaire, un test ou la documentation que le compteur ment. Ne pas rouvrir cet arbitrage.
- **Angle mort 4** (même section, point 4) : rien n'a été exécuté — ni EXPLAIN, ni benchmark. **Conséquence pour IDX-1** : le constat est **statique**. Un index de FK manquant se démontre par lecture, c'est suffisant pour agir ; il est **interdit d'annoncer un gain chiffré** dans l'ADR, le commit ou la doc.
- **Angle mort 10** (point 10) : aucun parcours n'a été joué. Les constats d'expérience (EXP-2, SCAN-1) sont dérivés du code, pas d'une session réelle. Le dire dans l'ADR.

### Décisions techniques déjà prises par la contre-vérification — ne pas les rejouer

| Décision | Preuve |
|---|---|
| **Pas de `CREATE INDEX CONCURRENTLY`** (IDX-1) | Zéro occurrence sur les 131 migrations du dossier ; le CLI Supabase applique chaque fichier en transaction, où `CONCURRENTLY` est illégal — la migration échouerait à `db reset` comme à `db push`. La « correction proposée » de l'audit est fautive sur ce point. |
| **Pas d'index partiel `(campaign_id) where source='share'`** à la place de l'index complet (IDX-1) | Le partiel ne sert ni le CASCADE de `src/actions/campaigns.ts:942-946`, ni `org_campaign_stats` (`supabase/migrations/00019_atomic_security_sessions_timezone.sql:635-636`), qui est le chemin le plus chaud. |
| **Pas de `count: "estimated"`** (CNT-1) | Aucun total n'est affiché : `src/app/dashboard/participations/page.tsx` n'utilise `count` qu'en `:452` (`hasNext`), et `src/components/dashboard/pagination.tsx:3-31` ne reçoit ni ne rend de total. Le motif « une ligne de plus », déjà employé par `src/app/dashboard/campaigns/page.tsx:63-64`, est moins cher et cohérent. |
| **La garde budget NE descend PAS dans `set_campaign_status`** (FIA-4) | `resumeCampaignAfterBudget` (`src/actions/campaigns.ts:555-655`, RPC en `:624`) appelle la MÊME RPC et autorise délibérément une reprise à plafond inchangé (documenté `:547-554`, affiché `src/components/dashboard/campaign-automation.tsx:372-376`). |
| **La matrice d'états FIA-6 vise la CAMPAGNE SEULE** | Les six autres écrans **offrent** `archived → active` : `src/components/dashboard/hunt-editor.tsx:677`, `calendar-editor.tsx:895`, `quiz-editor.tsx:175`, `loyalty-editor.tsx:884`, `jackpot-editor.tsx:546`, `event-editor.tsx:124`. Interdire partout casserait six parcours légitimes. |
| **La garde FIA-1 se pose APRÈS `assert_module_publish_allowed`** | Sinon les deux `throws_ok` de `supabase/tests/publication_guards.test.sql:481-485` et `:489-493` changeraient d'erreur. Ordre motivé par `supabase/migrations/20260925120000_droits_stripe.sql:587-596`. |
| **Ne pas toucher `launch_event_question`, `lock_event_question`, `reveal_event_question`, `end_event_session`** (FIA-1) | Elles prolongent une publication déjà autorisée ; les couper interromprait une soirée en cours — raisonnement déjà écrit en `supabase/migrations/20260905120000_p0_gardes_publication.sql:596-599`. |
| **Ne pas toucher `run_campaign_schedule` au titre de FIA-6** | Le cron écrit `campaigns.status` par UPDATE direct en `security definer` (`supabase/migrations/20260723110000_merchant_automations.sql:206-234`), jamais par la RPC : une matrice côté RPC ne peut pas le casser. |
| **Ne pas toucher les tuiles `raccourcisCentre` ni `rewardsToHandOver`** (EXP-2) | La divergence tuile `/dashboard/participations?statut=a-valider` vs hero/tâche `/dashboard/redeem` est un arbitrage tranché et documenté (`src/components/dashboard/prochaine-action-state.ts:96-99`, `src/app/dashboard/page.tsx:162-168`). La règle nouvelle porte sur la paire **hero ↔ tâche masquée**, pas sur la tuile. |
| **Ne pas toucher la cascade SQL de `event_answers`** (EXP-3) | `supabase/migrations/20260727120000_events_live.sql:259-260`. La retirer donnerait un 23503 opaque — doctrine déjà écrite `src/actions/events.ts:1322-1325`. |
| **Une seule migration neuve pour tout le wagon**, écrite par `db-supabase` **avant** tout travail applicatif | FIA-1, FIA-3, FIA-6, NUM-1, IDX-1 et CNT-1 y écrivent ; deux migrations concurrentes sur `set_campaign_status` s'écraseraient. |
| **`src/lib/release.ts:12` n'est écrit que par `db-supabase`** | Fichier de couture partagé par cinq constats ; un test unitaire (`release.test.ts`) fait rougir la CI en cas d'écart. |

### Corrections à l'audit, établies et à répercuter (travail économisé)

Ces six points sont **faux dans `docs/audit-transverse-2026-08-16.md`**. Suivre l'audit à la lettre ferait éditer une définition morte ou chercher un défaut inexistant.

1. **FIA-2** — l'audit cite `20260905120000:445-530` pour `set_contest_status` : **PÉRIMÉ**. La définition vivante est `supabase/migrations/20260925120000_droits_stripe.sql:541-630` (recréée par le wagon 2 pour passer `p_contest_id`). C'est ce corps-là qui ferait foi si l'on descendait la garde.
2. **FIA-3** — l'audit cite `20260723110000:213-221` pour `run_campaign_schedule` : **PÉRIMÉ**. La définition vivante est `supabase/migrations/20260926120000_pass_expire_lisible.sql:121-205`, CTE `activated` en `:127-141`. Le défaut a survécu mot pour mot (`:130-133` ≡ ancien `:216-219`).
3. **IDX-1** — l'audit dit que `contest_awards.contest_id` mérite un index : **FAUX**. `supabase/migrations/20260721150000_contest_rules_and_awards.sql:531` porte `unique (contest_id, rank)`, qui fournit l'index de tête. Idem `contest_awards.organization_id`, couvert par `contest_awards_org_idx` (`:540`). Les trois FK réellement découvertes sont `contest_awards.player_id`, `contest_final_standings.player_id`, `contest_final_standings.organization_id`.
4. **SCAN-1** — « six autres modules » : **SEPT**. `src/lib/module-page-opens.ts:22-30` liste `quiz, calendar, jackpot, pronostics, loyalty, events, hunts`, et `src/app/api/page-opens/route.ts:10` dit « les sept modules à QR ». Le « six » du préambule `20260911120000:7` est antérieur à l'élargissement du CHECK à `hunts`.
5. **NUM-1** — `experience_completed` a **TROIS émetteurs**, pas un : `supabase/migrations/20260805160000_experience_analytics.sql:675` (`track_experience_activity`), `:798` (`track_experience_completion`, triggers `:812-823` pour chasse/pronostics/quiz/calendrier) et `:857` (`track_event_session_completion`). Ne dater que le premier reproduirait le défaut sur cinq modules.
6. **FIA-5** — le `confirm()` de `src/components/dashboard/prize-editor.tsx:395` **nomme le lot** (`Supprimer le lot « ${prize.label} » ?`). Ce qu'il ne nomme pas, c'est la **conséquence** (la roue devient injouable). Ne pas partir chercher un `confirm("Êtes-vous sûr ?")` : il n'existe pas.

### Trous mécaniques fermés par ce brief (l'agent ne choisit pas seul)

Quatre points où la cartographie prescrivait un geste **non réalisable tel quel**. Le brief tranche, pour éviter que chaque agent invente sa variante.

- **FIA-1 — `startEventSession` n'a aucun `organizationId` avant `runTransition`.** Vérifié : l'organisation naît dans `authorizeRemote` (`src/actions/events.ts:369-397`) et n'est rendue que par la closure `(admin, organizationId)` de `runTransition` (`:403-411`). **Décision : ajouter à `runTransition` un 4ᵉ paramètre optionnel `precondition?: (admin, organizationId) => Promise<string | null>`, exécuté après `authorizeRemote` (`:412-413`) et avant `run(...)` (`:416`), rendant `{ ok: false, error }` si non nul.** Interdit : un second `getUserAndOrg()` (il doublerait la lecture de `event_sessions` que `authorizeRemote` vient de faire) ; interdit : poser la garde dans `authorizeRemote`, partagé par les cinq transitions.
- **FIA-2 et FIA-5 — `estTirable` / `estGagnantTirable` ne sont PAS exportés.** Vérifié : `src/components/dashboard/atelier-verification-state.ts:72` et `:76` sont des `function` module-privées ; les seuls exports sont les types (`:31, :38, :51, :62`) et `construireVerification` (`:80`). **Décision : `backend-api` crée `src/lib/lot-tirable.ts`** portant `estTirable`, `estGagnantTirable` et la constante de phrase (texte exact de `atelier-verification-state.ts:126`) ; **`frontend-ui` rewire `atelier-verification-state.ts` pour les importer** au lieu de les définir. Une seule vérité, fichiers disjoints, l'en-tête `:21-29` (« DEUX PRÉDICATS QU'ON NE RECOPIE PAS ») est respecté. Interdit : exporter depuis `src/components/` pour qu'une action serveur importe un module de composant.
- **FIA-3 — il n'existe aucun endroit « sous le bouton :34 » de `campaign-settings.tsx`.** `STATUS_ACTIONS` (`src/components/dashboard/campaign-settings.tsx:27-37`) est un **tableau de données** `{from, to, label}` rendu génériquement par le `.map` de `:87-99`. **Décision : étendre le type d'un champ optionnel `note?: string` rendu dans le map**, plutôt qu'un paragraphe hors table — la mention doit suivre son bouton, y compris si l'ordre change.
- **LIST-1 — les requêtes enfants vivent DANS le même `Promise.all` que la requête parente**, alors que `couperPage` ne s'exécute qu'après (`quiz/page.tsx:69-75` puis `:77` ; `loyalty:62-77` puis `:79` ; `pronostics:65-73` puis `:75` ; `hunts:59-72` puis `:74`). Les ids de la page ne sont donc **pas connus** au moment où les requêtes enfants partent : les borner **impose de casser le `Promise.all` en deux `await` séquentiels**, soit un aller-retour de latence en plus sur quatre écrans — un coût que le dépôt valorise explicitement ailleurs (`src/app/dashboard/participations/page.tsx:116`). Ce fait est **versé au débat de l'arbitrage LIST-1**, il ne le tranche pas.

---

## État des 13 constats après contre-vérification

| ID | Sév. | Statut | Une ligne |
|---|---|---|---|
| **FIA-1** | P2 | **TIENT** | `startEventSession` (`src/actions/events.ts:478-491`) n'appelle que `runTransition` ; `start_event_session` (`20260905120000:546-591`, vivante) ne joint jamais `event_games` — un jeu brouillon et vide ouvre son lobby au public. |
| **FIA-2** | P2 | **PARTIEL** | Le constat est intégralement confirmé (`updateCampaign` `src/actions/campaigns.ts:188-196` et `updateContest` `src/actions/pronostics.ts:340-347` n'ont aucune garde métier) ; c'est le **geste prescrit** qui était irréalisable (prédicats non exportés) et **deux ancrages de test** qui étaient faux — corrigés ci-dessus et dans le lot backend. |
| **FIA-3** | P1 | **TIENT** | Le CTE `activated` (`20260926120000:130-133`) n'épargne que `paused_reason = 'budget_reached'` ; rien ne désarme `auto_schedule` (`updateCampaignSchema`, `src/lib/validations/campaigns.ts:24-30`, ne le porte pas) — une pause manuelle repart seule en ≤ 10 min (cron `20260723110000:243-247`). |
| **FIA-4** | P2 | **TIENT** | `STATUS_ACTIONS` (`campaign-settings.tsx:33`) offre « Rouvrir aux joueurs » sur toute pause ; le filtre `:79-81` ne lit que `campaign.status` alors que la prop porte déjà `paused_reason`/`budget_cents`/`budget_spent_cents` (`:54`). |
| **FIA-5** | P3 | **TIENT** | `deletePrize` (`src/actions/prizes.ts:230-258`) parse, résout l'org, supprime — aucune lecture d'état ; et `prize-editor.tsx:165-170` **ignore `state`**, donc un refus serveur seul serait muet. |
| **FIA-6** | P3 | **TIENT** | Sept RPC sur huit n'ont aucune matrice ; `set_campaign_status` (`20260905120000:609-651`) laisse passer `archived → active` alors que l'écran n'offre que `archived → draft` (`campaign-settings.tsx:36`) ; grant réel en `20260905120000:1011`. |
| **NUM-1** | P1 | **TIENT** | Clé de vue datée (`20260805160000:484-485`) contre clés de start/complete à vie (`:661-662`, `:675-676`, `:798`, `:857`), agrégées en `count(*)` (`:1124-1127`, `:1176-1183`) puis divisées à l'écran (`experience-analytics.tsx:75-83`). |
| **SCAN-1** | P2 | **TIENT** | `src/app/dashboard/page.tsx:329-333` affiche « Scans QR » sans `hint`, sur `sum(qr_codes.scan_count)` (`00019:676`) — des chargements de page, et de la **roue seule** (`qr_codes.campaign_id not null`, `00001:86`). |
| **LIST-1** | P2 | **TIENT** | Quatre pages paginent leur parent puis lancent six requêtes enfants sans borne de page (`quiz:71-74`, `loyalty:65-68` et `:69-77`, `pronostics:67-72`, `hunts:62-65` et `:66-71`) ; zéro test unitaire sur `litFiltresModule`/`couperPage`. |
| **IDX-1** | P2 | **TIENT** | `public.spins` ne porte que 4 index (`00002:20-21`, `00002:22`, `00019:150-152`, `20260927120000:77-79`), aucun sur `campaign_id` ni `prize_id` ; `participations` n'en a aucun sur `prize_id`. |
| **CNT-1** | P3 | **TIENT** | `count: "exact"` (`participations/page.tsx:107`) pour un usage unique en `:452` ; et les **cinq** points de parse de page appliquent `Math.max(1, …)` sans `Math.min` (recensement exhaustif : `campaigns:29`, `customers:29`, `participations:84`, `qr-codes:154`, `module-list-filters:64`). |
| **EXP-2** | P2 | **TIENT** | Le hero rend `/dashboard/campaigns` pour `brouillons` (`prochaine-action-state.ts:122`) et `rien-ouvert` (`:144`), puis masque (`:265-271`) les tâches qui menaient ailleurs (`centre-animation-server.ts:141` et `:161`) — la page d'arrivée dit « Aucune campagne pour l'instant » (`campaigns/page.tsx:89-91`) pour un compteur qui unit neuf modules (`20260914120000:111-172`). |
| **EXP-3** | P2 | **TIENT** | `deleteEventQuestion` (`src/actions/events.ts:1133-1165`) supprime au premier clic (`event-editor.tsx:425-434`), cascade sur `event_answers` (`20260727120000:259-260`) et `current_question_id → set null` (`:177`) en pleine soirée. |

**Aucun constat n'est DEJA_CORRIGE ni PERIME.** Vérifié pour les 13 : `git diff --stat origin/main...HEAD` (wagon 3) ne liste aucun des fichiers concernés, et `git show --name-only 585d0e7 / 7db27ee` non plus. Le seul travail économisé par la contre-vérification est celui des **six corrections à l'audit** ci-dessus, qui auraient envoyé un agent éditer une migration morte (`set_contest_status`, `run_campaign_schedule`) ou chercher un index déjà présent (`contest_awards.contest_id`).

**Fait non vérifié, signalé comme tel** : le recensement « 38 FK sans index de tête » de l'audit n'a **pas** été rejoué. Sa seule désignation contrôlée (`contest_awards.contest_id`) s'est révélée fausse. Élargir IDX-1 sur sa foi est une décision de périmètre, pas une évidence (question ouverte n° 8).

---

## Ordre d'exécution

Le DAG réel. Rien ici n'est décoratif : chaque flèche existe parce que deux constats se croisent sur un fichier ou parce qu'un lot lit ce qu'un autre écrit.

```
[0] PRÉALABLE
    Fusion du wagon 3 (PR #150) → branche chantier/audit-p1-controle depuis main à jour
    Réponse du propriétaire aux 7 questions bloquantes (section « Questions ouvertes »)
              │
              ▼
[1] DB SEULE — db-supabase                        UNE migration : 20260928120000_controle_commercant.sql
    FIA-1(a) · FIA-3 · FIA-6 · NUM-1(SQL) · IDX-1 · CNT-1(SQL) · [LIST-1(RPC) si branche retenue]
    + supabase/tests/*.sql  + src/lib/release.ts:12  + src/types/database.generated.ts
    Vérif ciblée : ./scripts/verif-complete.sh --db-seul. Commit.
              │
              ├─────────────────────────────────────────────┐
              ▼                                             ▼
[2a] BACKEND — backend-api                        [2b] FRONTEND — frontend-ui
     src/lib/*, src/actions/*                          src/app/*, src/components/*
     FIA-1(b) · FIA-2 · FIA-4(prédicat+garde)          FIA-1(c) · FIA-3(mention) · FIA-4(filtre)
     FIA-5(backend) · FIA-6(backend) · EXP-3           FIA-5(frontend) · NUM-1(écran) · SCAN-1 · EXP-2
     NUM-1(parseur+conseiller) · CNT-1(helper)         CNT-1(5 sites d'appel) · LIST-1(4 pages)
              │                                             │
              └─────────────────────┬───────────────────────┘
                                    ▼
[3] qa-verify  ∥  security-review        (parallèles, indépendants)
                                    ▼
[4] docs-scribe   ADR wagon 4, roadmap, bugs.md (5 entrées à fermer), CLAUDE.md
                                    ▼
[5] PR → babysit-CI → squash → santé post-déploiement
```

**Pourquoi DB d'abord et seule** : `set_campaign_status` est écrit par **FIA-3 et FIA-6** — un seul `create or replace` porte les deux gestes, sinon le second écrase le premier. `supabase/tests/publication_guards.test.sql` est écrit par **FIA-1, FIA-3 et FIA-6**. `src/lib/release.ts:12` est réclamé par cinq constats.

**Pourquoi 2a et 2b sont réellement parallèles** : la frontière est posée **fichier par fichier** (section « Ce que chaque lot ne doit PAS toucher »), pas dossier par dossier — deux exceptions assumées y sont nommées (`src/lib/centre-animation-server.ts` va au frontend, `src/lib/lot-tirable.ts` est créé par le backend et consommé par le frontend).

**Séries strictes à l'intérieur d'un lot** (même agent, même fichier) :
- `src/actions/campaigns.ts` `updateCampaign` : ordre d'insertion **accès (`:188-196` existant) → métier FIA-2 → budget FIA-4**, puis la branche `transition` de FIA-6 dans la cascade `:222-241`. Deux blocs concurrents au même point d'insertion sinon.
- `src/actions/events.ts` : FIA-1 (`runTransition` + `startEventSession`) puis EXP-3 (`deleteEventQuestion`).
- `src/components/dashboard/campaign-settings.tsx` : FIA-3 (`note`) puis FIA-4 (filtre `:79-81`).
- `src/lib/destructive-confirm-coverage.test.ts` : EXP-3 y inscrit la 11ᵉ garde. **Si** le propriétaire retient la confirmation cochable pour FIA-5, la 12ᵉ s'y ajoute — même agent, même commit, compte porté à 12 (`:272` et le titre `:268`).

---

## Lot DB — agent `db-supabase`

**Livrable unique** : `supabase/migrations/20260928120000_controle_commercant.sql`, plus les fichiers pgTAP listés, plus `src/lib/release.ts:12` → `"20260928120000"`.

Numéro imposé : la dernière migration du dossier après fusion du wagon 3 est `20260927120000_boucle_joueur_gain.sql` (vérifié). En-tête de migration obligatoire : dire ce que le fichier porte (six constats), et **pourquoi la mesure NUM-1 se répare vers l'avant sans backfill**.

### FIA-1 — `start_event_session` lit enfin le statut du jeu

- **Lire** : `supabase/migrations/20260905120000_p0_gardes_publication.sql:546-591` (définition **vivante** ; `grep` sur tout `supabase/migrations` ne rend que `20260727120000:633` et celle-ci). Corps : `is_org_editor` → `select s.* from public.event_sessions s … for update of s` → statut dans `('draft','lobby')` → `assert_module_publish_allowed(p_organization_id,'events')` en `:579` → update. Commentaire `:593-599` : le raisonnement « ne pas couper une soirée en cours ».
- **Écrire** : `create or replace function public.start_event_session(...)`, corps **recopié verbatim**, plus, **après** `:579` et jamais avant :
  ```sql
  select g.status into v_game_status
    from public.event_games g where g.id = v_session.game_id;
  if v_game_status is distinct from 'active' then
    return jsonb_build_object('state','invalid_transition');
  end if;
  ```
  `invalid_transition`, **pas un `raise`** : homogène avec la lecture de session ratée, et ne révèle pas d'état par le message. Noter dans le `comment on function` que le refus lisible pour le commerçant vient de l'action (lot backend), la RPC étant le filet du POST direct — `runTransition` traduit `invalid_transition` en « Transition impossible dans l'état actuel. » (`src/actions/events.ts:443-445`), ce qui ne nomme aucun geste.
- **Ne pas toucher** : les quatre autres transitions (voir « déjà tranché »).
- **pgTAP** — `supabase/tests/publication_guards.test.sql`, section 6 (« start_event_session — LA PORTE GARDÉE NULLE PART », ouvre `:475`), assertion neuve **après** la non-régression `:505-508` :
  - étendre les fixtures `event_games` (`:105-108`) d'un jeu `ca000000-0000-4000-8000-000000000164`, organisation 1 (**qui a le droit `events`**), `status = 'draft'` ; et `event_sessions` (`:120-123`) d'une session `…000194` en `draft` ;
  - sous le JWT éditeur `…0000a1` : `is((public.start_event_session('…0001','…0194'))->>'state', 'invalid_transition', 'un jeu encore en brouillon n''ouvre pas son lobby')`, **puis** que la session est restée `draft` ;
  - vérifier que les deux `throws_ok` de `:481-485` et `:489-493` rendent toujours `module access required: events` (elles portent sur des organisations **sans** droit — d'où l'ordre imposé).
  - Le fichier est en `no_plan()` (`:39`, vérifié) : aucun compteur à relever.
  - **Non-régression vérifiée** : `supabase/tests/events.test.sql:36-39` insère son jeu en `'active'`, `:100-103` reste vert. Aucun ajustement.
- **Critère de sortie** : `start_event_session` sur un jeu `draft` rend `invalid_transition` et laisse la session `draft` ; sur un jeu `active`, inchangé.

### FIA-3 + FIA-6 — `set_campaign_status`, un seul `create or replace`

- **Lire** : `20260905120000:609-652` — droit `:623-626`, vocabulaire `:627-629`, `select … for update` `:631-633`, `if not found` `:634`, court-circuit idempotent `if v_current = p_status then return true; end if;` `:635`, garde de droit `:637-639`, UPDATE `:641-642`, audit `:644-649`.
- **Écrire, dans cet ordre** :
  1. **FIA-6, matrice** — après le court-circuit `:635` et **avant** `assert_module_publish_allowed` `:637` : refuser `v_current = 'archived' and p_status = 'active'` par `raise exception 'invalid transition'`. Ordre calqué sur `set_contest_status` (`20260925120000:579-585`) et motivé là-bas (`:587-596`) : une transition illégale doit se nommer telle, pas se déguiser en défaut de module.
  2. **FIA-3 branche A** — dans le MÊME `update` que le statut (`:641-642`), quand `p_status in ('paused','draft','archived')` : poser `auto_schedule = false`. Laisser `p_status = 'active'` intact (le trigger `campaigns_clear_paused_reason`, `20260723110000:49-69`, continue d'effacer le motif).
  3. Ajouter `'auto_schedule_disarmed', true` à la métadonnée d'audit (`:644-649`).
- **Vérifié, ne pas s'en inquiéter** : le trigger `campaigns_guard_auto_schedule` (`20260906120000:242-245`) ne garde jamais le **désarmement** — `guard_module_publication` sort dès que la valeur n'est pas dans `{true}` (`:160-162`) — donc un commerçant sans droit peut toujours pauser. Et le cron ne peut pas être arrêté par ce trigger : il tourne en propriétaire, `auth.role()` y est NULL, sortie `20260906120000:149-151`.
- **Deux appelants seulement**, tous deux applicatifs : `src/actions/campaigns.ts:216` et `:624`. Aucun cron, aucun service_role.
- **Écrire aussi le `comment on function`** : pourquoi la matrice ne vise que la campagne (six écrans offrent `archived → active`), et que la permissivité des six autres est désormais **prouvée** par pgTAP au lieu d'être affirmée par le commentaire `20260905120000:91-95`.
- **pgTAP** :
  - `supabase/tests/automation.test.sql` (`no_plan()` en `:20`), section « 2. Programmation automatique » : **cinquième fixture** dans le même `insert` que les quatre existantes (`:135-149`) — `auto_schedule = true`, `status = 'paused'`, `paused_reason = null`, `starts_at = now() - 1h`, `ends_at = now() + 1h`. Deux assertions : (a) `results_eq` sur `select campaign_id, action from public.run_campaign_schedule() order by action` — la campagne manuelle **n'y figure pas** (aujourd'hui elle sort en `'activated'`, l'assertion existante `:151-156` rougit par ajout d'une ligne : **c'est le signal**) ; (b) `select status, paused_reason from public.campaigns where id = <manuelle>` → toujours `('paused', …)`.
  - `supabase/tests/publication_guards.test.sql`, près de la section 4d **« LE RETOUR EN ARRIÈRE RESTE LIBRE » qui est à `:416-433`** (l'ancrage `432-458` de la cartographie était faux : `:434-464` est la section 5). Le geste de bascule de JWT à recopier est `:419-423`. Assertion FIA-3 : après `set_campaign_status(org, camp, 'draft')`, `is((select auto_schedule from public.campaigns where id=…), false, '…')`.
  - `supabase/tests/publication_guards.test.sql`, **section neuve « 9. LA MATRICE D'ÉTATS, ÉNUMÉRÉE »**, à insérer **juste avant `select * from finish();` (`:811`)** et **surtout pas avant la section 5bis (`:465-473`)**, dont l'assertion `audit_logs = 9` (`:473`) rougirait à la première transition supplémentaire.
    - Cas rouge : sous `service_role`, `update public.campaigns set status='archived' where id='ca000000-0000-4000-8000-000000000101'` ; rebascule sur le JWT `sub = ca000000-0000-4000-8000-0000000000a1` ; puis `throws_ok($$select public.set_campaign_status('…0001','…0101','active')$$, 'P0001', 'invalid transition', 'une campagne CLÔTURÉE ne se republie pas par appel direct')`. Aujourd'hui l'appel **réussit**.
    - Contrôles négatifs **obligatoires** (sans eux un `raise` inconditionnel passerait) : `ok(public.set_campaign_status(A, 101, 'draft'))` depuis `archived` ; et `archived → active` **réussit** pour les six autres modules (`set_hunt_status`, `set_calendar_status`, `set_loyalty_program_status`, `set_quiz_status`, `set_jackpot_campaign_status`, `set_event_game_status`) — l'assertion qui épingle la permissivité comme un **choix**.
- **Critère de sortie** : `archived → active` lève `invalid transition` sur la campagne ; `archived → draft` passe et laisse `auto_schedule = false` ; une pause manuelle dans sa fenêtre n'est plus réactivée par `run_campaign_schedule` ; les six autres modules publient encore depuis `archived`.

### NUM-1 — la granularité des clés et les compteurs distincts *(sous réserve de la question ouverte n° 5)*

- **Volet clés** — dater les **quatre** émissions, pas une : `20260805160000:661-662` et `:675-676` (`track_experience_activity`), `:798` (`track_experience_completion`) et `:857` (`track_event_session_completion`). Recopier la lecture de fuseau de `track_player_experience_membership` (`:449-453`), calculer `v_local_day := (v_occurred_at at time zone v_timezone)::date`, suffixer `|| ':' || to_char(v_local_day,'YYYYMMDD')`.
- **Volet compteurs (additif, à faire dans tous les cas)** — `create or replace function public.org_experience_analytics(uuid,integer)` : ajouter `unique_viewers` / `unique_starters` / `unique_finishers` = `count(distinct coalesce(player_id::text, player_key)) filter (where event_name = 'experience_viewed' | 'experience_started' | 'experience_completed')`, dans la CTE `per_experience` (à côté de `:1134`) **et** dans le bloc `'summary'` (à côté de `:1194`). **Ne rien retirer** : `views`/`starts`/`completions`/`unique_players` restent.
- **Piège à commenter** : `player_id` (uuid) et `player_key` (sha256) sont deux espaces de noms (`:42-46`) ; le `coalesce` ne dédoublonne correctement que si la résolution d'identité (`:382-393`) a eu lieu.
- **Aucune régénération de types** : la RPC rend du `jsonb` (`src/types/database.generated.ts:7315-7318`, `Returns: Json`).
- **pgTAP** — `supabase/tests/experience_analytics.test.sql` (`no_plan()` en `:6`), après `:147`. **Avertissement de faisabilité, à budgéter** : le test doit passer **par le trigger** (`spins_experience_analytics`, `20260805160000:690`) sinon il ne prouve rien sur la granularité des clés — or la fixture actuelle (`:1-35`) ne crée **aucune `wheels`**, et `spins.wheel_id` est `not null` (`00002_spins.sql:12`) avec un unique `(wheel_id, player_key, play_window_key)`. Étendre la fixture d'une roue et de deux `spins` du même `player_key` à deux jours locaux distincts, avec deux `play_window_key` distincts. Assertions : `summary.starts = 2` (« deux jours de jeu comptent deux fois ») et `summary.unique_starters = 1` (« un seul joueur derrière ces deux jours »). Aujourd'hui : 1 et NULL.
- **Critère de sortie** : deux jours de jeu d'un même joueur produisent `starts = 2` et `unique_starters = 1` ; les trois compteurs distincts existent en `summary` et en `per_experience`.

### IDX-1 — trois index de FK

```sql
create index if not exists spins_campaign_idx        on public.spins (campaign_id);
create index if not exists spins_prize_idx           on public.spins (prize_id);
create index if not exists participations_prize_idx  on public.participations (prize_id);
```
- Patron du dépôt à suivre : `00019_atomic_security_sessions_timezone.sql:619-626` (et **non** `00001:113-115` — `participations` porte **cinq** index, pas trois : `00019:619-622` en ajoute deux).
- **pgTAP** — fichier **neuf** `supabase/tests/index_fk_couverture.test.sql`, `plan(3)` + trois `has_index(...)`. Fichier neuf plutôt qu'ajout à `security_acl.test.sql` : le sujet n'est pas le contrôle d'accès. *(Correction : `security_acl.test.sql:3` est en `no_plan()` — rien n'y serait à relever, l'argument du plan invoqué par la cartographie est faux ; la recommandation tient pour la seule raison du sujet.)*
- **Critère de sortie** : trois `has_index` verts. **Aucun chiffre de gain dans le commit ni l'ADR** (angle mort 4).

### CNT-1 — borner l'offset en base

Les deux RPC sont appelables directement en PostgREST (`grant execute … to authenticated` : `00019:713` et `20260923120000:745`) : un clamp TypeScript ne les couvre pas.
- `org_customer_profiles_page` (`20260923120000:797-801`) : étendre `if v_offset < 0 or v_limit < 1 or v_limit > 100` en `... or v_offset > <plafond>`.
- `org_qr_hub` (`20260923120000:344-345`) : `v_offset := greatest(coalesce(p_offset,0), 0)` n'est jamais plafonné — passer à `least(greatest(...), <plafond>)` ou lever la même exception.
- **Même plafond que côté TypeScript** (question ouverte n° 6).
- **pgTAP** — `supabase/tests/customer_profiles_page.test.sql`, **`plan(59)` en `:57` à relever** : un `throws_ok` sur `select * from public.org_customer_profiles_page(<org>, <offset au-dessus du plafond>, 50)` attendant `'invalid pagination'`. *(Vérifié : la vieille signature à trois arguments est droppée en `20260923120000:751`, l'appel positionnel n'est pas ambigu.)*
- **Critère de sortie** : un offset au-dessus du plafond lève dans les deux RPC.

### LIST-1 — RPC de comptage groupé *(uniquement si la branche RPC est retenue, question ouverte n° 7)*

Convention à copier : `20260914120000_centre_animation_counts.sql:83-108` — `returns table`, `language plpgsql`, `stable`, `security definer`, `set search_path = ''`, garde `is_org_owner`/`is_org_editor` **en premier geste** avant toute lecture. La RPC doit rendre, pour `loyalty_members`, **les deux** compteurs (total et `tier in ('silver','gold')`, cf. `loyalty/page.tsx:96`). Test : `supabase/tests/module_list_counts.test.sql` neuf — appelée avec deux ids, elle ne rend que deux lignes alors qu'un troisième parent de la même organisation existe et porte des joueurs. Régénérer `src/types/database.generated.ts` (seul cas du wagon qui l'exige).

---

## Lot backend — agent `backend-api`

Périmètre : `src/lib/**`, `src/actions/**` (à l'exception de `src/lib/centre-animation-server.ts`, voir frontières).

### FIA-1 (b) — la garde applicative qui nomme le geste

- `src/actions/events.ts` : ajouter le 4ᵉ paramètre `precondition` à `runTransition` (voir « trous mécaniques fermés »), puis le passer depuis `startEventSession` (`:478-491`) : lire `event_sessions.game_id` → `event_games.status` par `admin` (organisation déjà résolue), refuser si ≠ `'active'` avec une phrase qui **nomme le geste correct** : « Ouvrez le jeu aux joueurs avant de lancer une session en direct. »
- **Ne pas** recompter les questions : exiger `event_games.status = 'active'` rejoue par construction `blocageActivationEvent` (`src/lib/activation/events.ts:30-37`), déjà opposé à l'activation par `setEventGameStatus` (`src/actions/events.ts:716`).
- **Ne rien ajouter dans `authorizeRemote`** (`:369-397`).
- **Test** — `src/actions/events.start-session.test.ts` neuf, calqué sur `src/actions/events.session-delete.test.ts` : jeu `status: 'draft'` → `res.ok === false`, message nommant l'ouverture du jeu, **et surtout** `expect(state.rpc.map(a => a.nom)).not.toContain('start_event_session')` — c'est cette assertion qui prouve que la garde est **avant** la RPC.
- **Harnais à ajuster** : `src/actions/publication-refus.test.ts:69` rend `event_sessions: { single: { data: { id: SESSION_ID } } }`. Si la garde lit le jeu par jointure PostgREST, cette fixture doit porter le statut du jeu, sinon les deux tests `startEventSession` (`:363-378` et `:480-493`) tomberont sur le nouveau refus avant d'atteindre la traduction qu'ils mesurent.
- **À lire, ne pas modifier** : `createEventSession` (`src/actions/events.ts:1176-1206`) ne vérifie que l'appartenance du jeu, jamais son statut. **Décision : la création d'une session sur un jeu brouillon reste permise** (on prépare avant d'activer) ; l'écrire en commentaire.

### FIA-2 — les deux gardes métier manquantes

1. **Créer `src/lib/lot-tirable.ts`** : `estTirable` et `estGagnantTirable` (copie **déplacée**, pas dupliquée, de `atelier-verification-state.ts:72-74` et `:76-78`) + la constante de phrase, texte exact de `:126`. Miroir de `perform_atomic_spin` (`20260927120000:256-257, 275`) : `p.is_active and p.weight > 0 and (p.is_losing or p.stock is null or p.stock > 0)`.
2. **Extraire `blocageActivationContest({nbMatchs, nbQuestions}): string | null`** de `src/lib/activation/pronostics.ts:100-113`, sur le modèle exact de `blocageActivationEvent` — **même seuil, mêmes phrases** (les trois variantes de `:108-111`, dont celle du calendrier synchronisé). Aucune formulation neuve.
3. **`updateContest`** (`src/actions/pronostics.ts`) : après `hasPronosticsAccess` (`:342`) et **avant** la RPC (`:352-360`), quand `status === 'active'`, lire en `Promise.all` (patron `src/actions/hunts.ts:232-245`) le compte de `contest_matches` par `question_type` et refuser via le prédicat.
4. **`updateCampaign`** (`src/actions/campaigns.ts`) : après la garde d'accès (`:188-196`) et **avant** `createClient()` (`:198`), quand `status === 'active'`, charger la roue visée et ses lots avec la **même sélection** que `src/app/dashboard/campaigns/[id]/page.tsx:200-214` (roue = `wheelsAvecLots[0]`, tri position puis `created_at` `:193-199`) et refuser via `estGagnantTirable` importé de `src/lib/lot-tirable.ts`.
5. **Trois commentaires devenus faux à réécrire** : `src/lib/activation/pronostics.ts:9-12` et `:16-17` (« il n'existe AUCUNE précondition métier », « il n'existe pas d'`activationBlocker` côté pronostics ») ; `src/lib/checklist/controles.ts:107-111` (`pronostics: {}` → `{ matiere: true }`, commentaire compris) ; `src/lib/publication-transition.ts:23-28`.
- **Tests** :
  - `src/actions/pronostics.test.ts` — **nouveau describe à écrire à côté de `:763` / `:823`** (les describes `updateContest` existants ; `:374-448` est `createContest`, l'ancrage de la cartographie était trompeur). Org avec `addon_pronostics` actif, zéro `contest_matches`, `status: 'active'` → `ok === false`, message du contrôle `matiere`, **et** `expect(state.rpcCalls.map(c => c.name)).not.toContain('set_contest_status')` (`state.rpcCalls` existe en `:28`, alimenté `:91` et `:163`). Contrôle inverse : 1 match → passe.
  - `src/actions/campaigns.test.ts`, describe existant `:201-292` : roue dont tous les lots gagnants sont `is_active:false` / `stock:0` / `weight:0` → refus avec la phrase « Aucun lot gagnant n'est tirable… », **jamais** `set_campaign_status`. Garder vert le témoin `:277` (« un simple renommage n'est jamais refusé »).
  - *Rassurant, vérifié* : `contestForm` (`pronostics.test.ts:368-372`) ne pose que les champs donnés — aucun test existant ne poste `status`, la garde neuve ne casse rien.

### FIA-4 — la reprise budget ne se contourne plus

1. **Prédicat** `repriseBudgetRequise(c): boolean` → vrai ssi `status === "paused" && paused_reason === "budget_reached" && budget_cents !== null && budget_spent_cents >= budget_cents`. Les deux cas nuls sont **intentionnels** et doivent être commentés : plafond retiré, ou plafond déjà relevé → **faux**, la reprise générique redevient offerte.
   **Placement** : *à trancher par l'agent, présenté comme un choix et non comme une règle écrite* — la cartographie invoquait `src/lib/campaign-window.ts:16-17` et une « garde structurelle », mais ce commentaire désigne `campaignWindowState` (fenêtre `starts_at`/`ends_at`) et `campaign-window-coverage.test.ts` (84 lignes, pas 45) ne porte que sur ce prédicat de fenêtre. `repriseBudgetRequise` ne lit aucune date. Le placer dans `campaign-window.ts` reste défendable ; le justifier, ne pas l'hériter.
2. **`updateCampaign`** (`src/actions/campaigns.ts`) : garde insérée **après FIA-2**, avant `createClient()` (`:198`). Relire `.from("campaigns").select("status, paused_reason, budget_cents, budget_spent_cents").eq("id",id).eq("organization_id",organization.id).maybeSingle()`. Message dans le vocabulaire de la bannière (`campaign-automation.tsx:337-339`), nommant le geste et le montant. **Une ligne absente ne bloque pas** : `maybeSingle()` à `null` → laisser passer, se fier au « Campagne introuvable » de `:237` (ne pas fabriquer un second oracle d'existence).
3. **Ne rien changer** à `resumeCampaignAfterBudget` (`:555-655`, précondition `:594-596`), ni au trigger, ni à la bannière.
- **Tests** : `src/actions/campaigns.test.ts` — org à accès **actif** (`org({ trial_ends_at: "2999-01-01T00:00:00.000Z" })`, sinon la garde `:188` refuse avant et le test serait vert pour la mauvaise raison), `state.sourceCampaign` (branche select `:92`, `maybeSingle` `:121`) = `{status:"paused", paused_reason:"budget_reached", budget_cents:20000, budget_spent_cents:30000}` → `ok === false`, message contenant « budget », aucun `update`. **Le faux client n'expose pas `rpc`** (harnais `:58-131`) : sans la garde, l'action lève `supabase.rpc is not a function` — c'est le signal, et cela prouve que la garde s'exécute avant la RPC. Le cas passant (plafond relevé, l'action atteint la RPC) va dans `src/actions/publication-refus.test.ts` (`:222-300`), dont le harnais simule `rpc`. Table de cas du prédicat dans son fichier de test.

### FIA-5 (backend) — `deletePrize` cesse de rendre une roue injouable

- `src/actions/prizes.ts`, **entre `:238` et `:240`** : relire le lot avec sa roue et le statut de sa campagne (`select id, wheel_id, is_active, is_losing, weight, stock, wheels!prizes_wheel_id_fkey(campaign_id, campaigns(status))` — la relation est déjà employée `:245` et `:210`). Absent → « Lot introuvable ».
- Campagne ≠ `active` → suppression inchangée (un brouillon se remanie librement).
- Campagne `active` **et** lot gagnant-tirable → compter les **autres** lots gagnants tirables de la même roue avec `estGagnantTirable` (`src/lib/lot-tirable.ts`). Compte 0 → refus, phrase de `atelier-verification-state.ts:126`.
- **Fail-closed** : `count === null` ou `error` ne vaut **pas** zéro — refuser et `reportError`, règle de `deleteWheel` (`:456-462` refus sec, `:495-520` refus confirmable).
- **Test** — `src/actions/prizes.delete-prize.test.ts` neuf (n'existe pas ; gabarit `src/actions/prizes.delete-wheel.test.ts`, 365 lignes, `vi.hoisted` `:40`, mocks `:61-76`, contrôle négatif de marqueur `:221`). Quatre cas : (1) rouge aujourd'hui — campagne active, un seul lot gagnant tirable → `ok:false`, erreur contenant « bredouilles », `state.deletes === []` ; (2) campagne `draft` → passe ; (3) deux lots gagnants → passe ; (4) comptage en panne → refuse.
- **Ne pas toucher** : `updateWheel`, `updatePrize`, `deleteWheel`, aucun SQL. *(Défaut voisin consigné, hors périmètre : `updatePrize` `:168-215` permet d'atteindre le même état injouable par `weight`/`stock`/`is_losing` — question ouverte n° 9.)*

### FIA-6 (backend) — le refus dit juste

- `src/lib/publication-transition.ts` : ajouter `transition` à `IssueTransition` (`:50`) et à `TextesTransition` (`:32-41`), détecté dans `classerTransition` (`:67-81`) sur `message.includes("invalid transition")`, **avant** le repli `echec` (`:76`).
- Le compilateur réclamera la clé à **huit** sites, pas sept : les sept appelants de `refusTransition` — `calendar.ts:1010`, `events.ts:729`, `hunts.ts:263`, `jackpot.ts:279`, `loyalty.ts:317`, `quiz.ts:1195`, `referral.ts:726` — **plus `src/lib/publication-transition.test.ts:22`** (`const TEXTES: TextesTransition = {`). Phrase unique, déjà en service : « Ce changement de statut n'est pas permis. » (`src/actions/pronostics.ts:110`). Ne pas en inventer une seconde.
- `src/actions/campaigns.ts:222-241` : branche `issue === "transition"` avec la même phrase (aujourd'hui `:240` afficherait « Mise à jour impossible »).
- **Tests** : `src/lib/publication-transition.test.ts` — cas neuf après `:73-84`, `classerTransition({data:null, error:{message:'invalid transition'}})` → `'transition'` ; le cas `invalid status → echec` (`:78-80`) reste vert, c'est lui qui prouve qu'on n'a pas élargi au hasard. **Et un cas dans `src/actions/publication-refus.test.ts`** (539 lignes, gabarit `:261-278` et `:453`) : la classe seule ne prouve pas que la phrase **atteint le commerçant**.
- **`resumeCampaignAfterBudget` (`:555-655`) ne demande que `paused → active` : rien à changer.**

### EXP-3 — supprimer une question de soirée devient un geste tenu

1. `src/lib/validations/events.ts`, près de `:323` : `export const EVENT_QUESTION_LOSS_HINT = "Cochez la case de confirmation";` — **valeur exacte imposée** par `src/lib/destructive-confirm-coverage.test.ts:247-255`. Commenter pourquoi il est distinct de `EVENT_SESSION_LOSS_HINT` (les deux cases vivent dans le même écran). Ne rien ajouter à `deleteEventQuestionSchema` (`:243-245`) : le champ se lit par `formData.get`.
2. `src/actions/events.ts`, dans `deleteEventQuestion`, après la relecture de `game_id` (`:1151`) et avant le delete (`:1153`) :
   - **(a) garde absolue, non confirmable, en premier** : compter les `event_sessions` du jeu en `status = 'live'` (`.eq("game_id", question.game_id).eq("organization_id", …)`). Au moins une → refus **sans marqueur** (donc sans case) : la soirée est en cours, il faut la terminer. Aucune confirmation ne doit passer outre — `current_question_id` serait annulée en direct (`20260727120000:177`).
   - **(b) garde confirmable** : compter `event_answers` sur `question_id` + `organization_id`, en **tri-état** via `verdictCodesEnAttente` (`src/lib/codes-en-attente.ts:53-66`). Jamais `?? 0` — c'est exactement le fail-open de `updateEventQuestion:1042-1047`, qu'il ne faut **pas** recopier. `indisponible` → `reportError("events.delete-question-answers", …)` + refus sans marqueur, avec un message d'indisponibilité **propre aux réponses** (`COMPTAGE_INDISPONIBLE` `:41-44` parle de codes en caisse). `en-attente` + `formData.get("confirm_answers_loss") !== "1"` → refus portant `${EVENT_QUESTION_LOSS_HINT}` et **nommant le nombre** de réponses perdues et l'effet sur le classement. `aucun` → suppression.
   - Patron serveur à recopier : `deleteEventSession` (`:1302-1364`, `verdictCodesEnAttente` `:1326-1333`, refus indisponible `:1335-1338`, refus confirmable `:1340-1349`).
   - Faisabilité vérifiée : policies `event_answers: member select` (`20260727120000:358-360`, grant `:386`) et `event_sessions: member select` (`:346`, grant `:376`) — client de session, pas de service role, pas de migration.
3. `src/lib/destructive-confirm-coverage.test.ts` : 11ᵉ entrée dans `GARDES` (`:83-178`, exactement dix aujourd'hui) — champ **`confirm_answers_loss`**, distinct de `confirm_outstanding` car `conditionAutour` (`:192-199`) remonte à la **première** occurrence du nom et `event-editor.tsx` en porte déjà un (`:257` interdit les homonymes). Passer `:272` et le titre `:268` de DIX à ONZE.
4. **Commentaire périmé à ramasser au passage** : `src/lib/codes-en-attente.ts:40` dit « Refus commun aux huit gardes » alors qu'elles sont dix, bientôt onze.
- **Test** — `src/actions/events.question-delete.test.ts` neuf, calqué sur `events.session-delete.test.ts` (176 lignes, `state.deletes` `:27`/`:74`, six `it` `:103,120,134,142,154,168`). Six cas : (1) 12 réponses → `ok:false`, message contenant « 12 » et le marqueur, `state.deletes` vide ; (2) `confirm_answers_loss=1` → supprime ; (3) zéro réponse → supprime sans case ; (4) session `live` → refus **sans marqueur**, même case cochée ; (5) caissier → refus de rôle sans marqueur, aucun comptage lancé ; (6) `{count:null}` → refuse.
- **Ne pas toucher** : la cascade SQL, `updateEventQuestion`.

### NUM-1 (TS) et CNT-1 (helper)

- `src/lib/experience-analytics-dashboard.ts` : ajouter `uniqueViewers`/`uniqueStarters`/`uniqueFinishers` à `ExperienceAnalyticsRow` (`:1-21`), `emptyMetrics` (`:44-61`) et `parseMetrics` (`:76-96`). `summary` étant un `Omit<ExperienceAnalyticsRow,…>` (`:36-39`), l'ajout se propage seul.
- `src/lib/conseiller-commercant.ts:209-218` (`act-vues-sans-partie`, sortie `:215`) : brancher sur `uniqueViewers`/`uniqueStarters`, réécrire le texte (« N personnes ont vu … ») et **mettre à jour la justification `:205-208`**, qui adosse le mot « vue qualifiée » à un tableau qui change.
- `src/lib/conseiller-commercant.test.ts:36-59` : `analytiqueVide()` est le **seul** autre constructeur littéral de `ExperienceAnalyticsSnapshot` du dépôt — tout champ ajouté à l'interface doit y être ajouté ou le typecheck casse. (Ne pas confondre avec `analytique` en `:61-66`.)
- `src/lib/experience-analytics-dashboard.test.ts:7-52` : étendre aux trois champs (présent et absent → 0).
- **CNT-1, helper unique** : `parsePageParam(brut, plafond)` + la constante de plafond, exporté depuis `src/lib` — c'est le lot backend qui l'écrit, le lot frontend le consomme aux cinq sites. Cinq `Math.min` recopiés divergeront.

---

## Lot frontend — agent `frontend-ui`

Périmètre : `src/app/**`, `src/components/**`, **plus** `src/lib/centre-animation-server.ts` (exception nommée).

### FIA-1 (c) — le bouton dit non avant le serveur

- `src/app/dashboard/events/[id]/remote/page.tsx:25-58` : charger le statut du jeu (`loadEventRemoteContext(id)` rend déjà `session.gameId`) et passer `gameActive` à `<EventRemote />`.
- `src/components/event/event-remote.tsx:221-229` : « ▶ Démarrer la session » est rendu dès `status === "draft"` sans connaissance du jeu — le désactiver avec la raison affichée.
- Le bandeau ambre de `src/components/dashboard/event-editor.tsx:810-815` **reste** (il ne suffisait pas ; le lien « 🎛 Piloter » de `:917-922` est rendu inconditionnellement, `src/app/dashboard/events/[id]/page.tsx:316`).

### FIA-3 + FIA-4 — la carte Statut de la campagne

*Même fichier, série stricte : FIA-3 puis FIA-4.*
- **FIA-3** : `src/components/dashboard/campaign-settings.tsx` — étendre le type de `STATUS_ACTIONS` (`:27-37`) d'un `note?: string`, rendu dans le `.map` (`:87-99`). Note sur « Mettre en pause » (`:34`) et « Restaurer en brouillon » (`:36`) : la programmation automatique est désarmée et se ré-arme dans « Programmation et budget ».
- **FIA-4** : filtre `transitions` (`:79-81`) — retirer `{from:["paused"], to:"active"}` quand `repriseBudgetRequise(campaign)`. **Ne toucher aucune des quatre autres transitions** : « Clôturer » (`:35`) doit rester offerte. La bannière porte déjà le geste correct (`campaign-automation.tsx:329-379`), ne rien ajouter.
- **Test** — `src/components/dashboard/campaign-settings.test.tsx` neuf, `// @vitest-environment happy-dom`. **Adapter les mocks** : `campaign-settings.tsx:4` importe `deleteCampaign`, `duplicateCampaign` **et** `updateCampaign`, là où le modèle `campaign-automation.test.tsx:5-8` n'en mocke que deux. Cas : pause budget non résorbée → `queryByRole("button", {name:"Rouvrir aux joueurs"})` vaut `null` **et** « Clôturer » existe (témoin de non-vacuité). Deux contrôles : `paused_reason: null` → le bouton est là ; plafond relevé → le bouton est là. Plus la mention de désarmement sur une campagne `active` avec `auto_schedule: true`.

### FIA-5 (frontend) — le refus a enfin un emplacement

- `src/components/dashboard/prize-editor.tsx:167-170` : récupérer `state` de `useActionForm(deletePrize)` (aujourd'hui seulement `{pending, onSubmit}` — le commentaire `:165-166` le dit : « une erreur de suppression n'a jamais eu d'emplacement d'affichage sur la ligne »). Rendre un `<FieldError>` sous le formulaire frère (après `:402`), aligné sur `:384-386`. **Sans ce point, le lot backend est un refus muet — c'est la moitié la plus importante des deux.**
- `:395` : reformuler le `confirm()` pour qu'il nomme la **conséquence**, pas seulement le lot.
- Rewire `src/components/dashboard/atelier-verification-state.ts` : importer `estTirable`/`estGagnantTirable`/la phrase depuis `src/lib/lot-tirable.ts`, supprimer les définitions locales `:72-78` et le littéral `:126`. `construireVerification` (`:80`) inchangé.
- *Note E2E* : `e2e/wheel-wizard.spec.ts:200-217` charge déjà `/dashboard/campaigns/{id}/wheel?etape=lots` et scanne `PrizeEditor` (`wheel/page.tsx:206-207`). L'ajout est sans risque (`FieldError` rend `null` sans message, `src/components/ui/input.tsx:33-36`), mais le fichier n'est **pas** vierge d'E2E : aucun spec n'exerce la suppression.

### NUM-1 (écran) — les tuiles comptent des personnes

`src/components/dashboard/experience-analytics.tsx` :
- Tuile 1 « Personnes ayant vu un jeu » (`:75-78`) → `summary.uniqueViewers`, indice `Sur N jours · ${summary.views} ouvertures cumulées`.
- Tuile 2 renommée « Joueurs ayant joué » (`:79-83`) → `uniqueStarters`, indice `percent(uniqueStarters, uniqueViewers)`.
- Tuile 3 « Joueurs ayant terminé » (`:84-88`) → `uniqueFinishers`, indice `percent(uniqueFinishers, uniqueStarters)`.
- Tuile 4 abandon (`:61`, `:89-93`) → `max(0, uniqueStarters - uniqueFinishers)`.
- Même substitution dans le tableau : en-têtes `:180-182`, cellules `:198`, `:199-201`, `:202-204`.
- **Ne pas toucher** au bloc `sources` (CTE `per_source` `:1158-1171` de la migration, clé jsonb `:1224`, écran `:240-262`) — il ne divise rien (question ouverte n° 10).
- **Test** — `src/components/dashboard/experience-analytics.test.tsx` **neuf** (aucun test n'existe pour ce composant) : `summary = {views:120, uniqueViewers:40, starts:40, uniqueStarters:40, …}` → « 40 » sous « Personnes ayant vu un jeu » et « 100 % des personnes » sur la tuile de départ. Aujourd'hui : 120 et « 33 % ».

### SCAN-1 — la tuile cesse de promettre des personnes

- `src/app/dashboard/page.tsx:329-333` : `label: "Ouvertures de page"`, et **remplir le `hint`** (déjà pris en charge par le rendu `:403-405`) avec les deux limites : chaque chargement compte, et le chiffre ne couvre que les pages de roue. Formulation courte proposée : « Chaque chargement compte · pages de roue uniquement ».
- **Forme tranchée par ce brief** : `hint`, **pas** un `title=` recopié de `qr-code-card.tsx:91-96` — `src/components/dashboard/info-bulle.tsx:3-21` condamne explicitement l'infobulle au survol (« ne s'ouvre ni au doigt sur un écran tactile, ni au clavier »). Recopier le `title=` propagerait le défaut que le dépôt a décidé de ne plus écrire.
- Ajouter deux lignes au commentaire de bloc `:308-322` disant pourquoi « Scans » est parti, en renvoyant à `src/app/api/page-opens/route.ts:17-20` et `20260911120000:25-32` — la décision de vocabulaire y est déjà motivée, ne pas la rejouer.
- **Ne pas toucher** : `org_dashboard_summary` (`00019:676`), la famille « QR jamais scannés » (`animation-center-state.ts:71-77`, `centre-animation-server.ts:116`, `prochaine-action-state.ts:130`, `qr-codes/page.tsx:494`, paramètre d'URL `scans=jamais`).
- **Test** — `e2e/dashboard-home.spec.ts` : remplacer « Scans QR » par « Ouvertures de page » dans la boucle `:86-91`, et ajouter « Scans QR » à la **boucle « vocabulaire interdit » déjà existante `:96-103`** (`Vues qualifiées`, `Rédemption`, `Marge attribuable`, `consentement marketing`) plutôt qu'en assertion isolée. Le bon niveau est l'E2E : `page.tsx` est un Server Component async appelant trois RPC, non rendable sous Vitest.

### EXP-2 — un fait masqué, une destination

- `src/components/dashboard/prochaine-action-state.ts:122` → `hrefs: ["/dashboard/qr-codes?etat=brouillon"]`.
- `src/lib/centre-animation-server.ts:141` → `href: "/dashboard/qr-codes?etat=brouillon"` (retire `/dashboard/discover`, catalogue sans un seul brouillon — déjà dénoncé en `src/app/dashboard/page.tsx:146-147` et `animation-center-state.ts:54-56`).
- `src/components/dashboard/prochaine-action-state.ts:144` → `hrefs: ["/dashboard/settings/modules"]`, destination de `verifier-les-modules` qu'il masque. **Ne pas** y mettre `?etat=actif` : ce candidat ne naît que si `liveExperiences === 0`, la liste serait vide par construction.
- **Exporter `CATALOGUE_ACTIONS`** depuis `src/lib/centre-animation-server.ts:101` (aujourd'hui `const` privé). Rien d'autre dans ce module.
- **Justification à retenir, la cartographie la sourçait mal** : `/dashboard/settings/modules` passe la contrainte du test `prochaine-action-state.test.ts:133-148` non pas parce qu'il serait absent de `CHEMINS_PROPRIETAIRE` (la liste **contient** `/dashboard/settings`, `src/lib/liens-proprietaire.ts:46`) mais parce que `estReserveAuProprietaire` (`:67-69`) compare par **égalité** après retrait de `?`/`#` — jamais par préfixe, et le commentaire `:61-65` le dit noir sur blanc.
- **Aucun libellé à changer** : « Reprendre un brouillon » et « Ouvrir une animation » restent justes.
- **Test** — `src/components/dashboard/prochaine-action-destinations.test.ts` neuf, mocks recopiés de `src/lib/centre-animation-server.test.ts:1-5` (le stub `server-only` est câblé par `vitest.config.ts:22`). Cas unique et mécanique : pour chacun des cinq états qui allument un candidat, `tachesRecouvertesParHero(action)[0]` → entrée de `CATALOGUE_ACTIONS` → exiger `action.cta.href === lienSelonRole(definition.href, "owner")`. **Rouge sur deux des cinq, vert sur trois** — c'est ce qui prouve que la garde mesure la dérive et non la forme.
- *Vérifié, aucune inquiétude à avoir* : `teamTasksAffichees` (`animation-center-state.ts:129-131`) et `getTeamActionBoardSnapshot` (`team-action-board-state.ts:63`) filtrent sur `status === "ready"` seul ; `availableTo` ne sert qu'à décider si la ligne devient un `<Link>` (`:39-48`). Compteur et liste s'accordent avant comme après.

### LIST-1 — borner les six requêtes enfants

- **Tables de configuration** (`quiz/page.tsx:71-74`, `hunts/page.tsx:62-65`, `loyalty/page.tsx:65-68`) : ajouter `.in("<parent>_id", idsDeLaPage)`, garder `.eq("organization_id", …)` et l'agrégation JS. Volume borné par 20 parents × la taille d'un module.
- **Tables de joueurs** (`pronostics/page.tsx:67-72`, `hunts/page.tsx:66-71`, `loyalty/page.tsx:69-77`) : `.in()` **ne suffit pas** — un championnat à 20 000 inscrits reste 20 000 lignes. Selon la branche retenue (question ouverte n° 7) : RPC de comptage groupé, ou motif `src/app/dashboard/events/page.tsx:74-94` (un `count exact head` par parent, ≤ 20 allers-retours, zéro ligne transférée).
- **Dans les deux régimes** : conserver **à l'identique** les gardes `role === "owner"` (`pronostics:67`, `hunts:66`, `loyalty:69`) ; construire les ids **après `couperPage`** (`module-list-filters.tsx:91-95`, `rows.pop()` en `:93`), jamais sur les 21 lignes brutes — ce qui impose de casser le `Promise.all` en deux `await` (coût de latence assumé, voir « trous mécaniques »). Pour `loyalty`, le comptage doit rendre **deux** chiffres (total et `tier in ('silver','gold')`, `:96`).
- **Ne pas toucher** : `calendar/page.tsx:61-75` et `jackpot/page.tsx:64-78`, vérifiés indemnes.
- **Test** — `src/components/dashboard/module-list-counts.test.ts` neuf, faux builder PostgREST recopié de `src/app/dashboard/participations/filters.test.ts:18-51` : 20 ids de page + un 21ᵉ parent hors page → le builder a reçu `in:<parent>_id:<les 20 ids>`, **et** aucune requête enfant n'est émise sans `.in()`. Aujourd'hui rouge (seul `.eq("organization_id")`).

### CNT-1 (écrans) — le count exact part, la page est bornée

- `src/app/dashboard/participations/page.tsx` : retirer `{count:"exact"}` (`:107`), passer `.range((page-1)*pageSize, page*pageSize)` (`:111`, une ligne de plus), retirer `count` de la destructuration (`:119`), calculer `hasNext` par débordement — exactement `campaigns/page.tsx:63-64`. Le plus propre : étendre `couperPage` (`module-list-filters.tsx:91-95`) d'un second paramètre optionnel `taille = MODULE_PAGE_SIZE` — aucun des sept appelants existants ne change, Participations l'appelle avec 50. **Aucune information ne disparaît de l'écran.**
- Employer `parsePageParam` (helper backend) aux **cinq** sites : `participations/page.tsx:84`, `module-list-filters.tsx:64`, `customers/page.tsx:29`, `campaigns/page.tsx:29`, `qr-codes/page.tsx:154`. Les deux derniers ne sont pas cités par l'audit et portent le même défaut : les laisser garantit la divergence que le constat dénonce.
- **Test** — `src/components/dashboard/module-list-filters.test.ts` neuf (aucun test unitaire de `litFiltresModule` aujourd'hui) : `litFiltresModule({page:"1000000"}, STATUTS).from` doit valoir `plafond × MODULE_PAGE_SIZE`, pas 19 999 980. Plus un cas prouvant que les cinq écrans reçoivent la même borne.

---

## Ce que chaque lot ne doit PAS toucher

La frontière est **par fichier**, pas par dossier. Deux exceptions sont nommées et assumées.

| Fichier | Propriétaire | Interdit à |
|---|---|---|
| `supabase/migrations/**`, `supabase/tests/**` | **db-supabase** | backend, frontend |
| `src/lib/release.ts` | **db-supabase** | backend, frontend (5 constats le réclament) |
| `src/types/database.generated.ts` | **db-supabase** (uniquement si LIST-1/RPC) | backend, frontend |
| `src/actions/**` | **backend-api** | frontend |
| `src/lib/lot-tirable.ts` *(neuf)* | **backend-api** (crée) | frontend **écrit non**, **importe oui** |
| `src/lib/publication-transition.ts`, `src/lib/activation/pronostics.ts`, `src/lib/checklist/controles.ts`, `src/lib/campaign-window.ts`, `src/lib/experience-analytics-dashboard.ts`, `src/lib/conseiller-commercant.ts`, `src/lib/validations/events.ts`, `src/lib/codes-en-attente.ts`, `src/lib/destructive-confirm-coverage.test.ts` | **backend-api** | frontend |
| **`src/lib/centre-animation-server.ts`** *(exception)* | **frontend-ui** (EXP-2) | backend |
| `src/components/**`, `src/app/**` | **frontend-ui** | backend |
| `src/components/dashboard/atelier-verification-state.ts` | **frontend-ui** (rewire des imports) | backend — il **déplace** les prédicats en créant `src/lib/lot-tirable.ts`, il ne modifie pas ce fichier |
| `e2e/**` | **frontend-ui** | backend, db |

**Fichiers partagés à l'intérieur d'un lot — série stricte, jamais deux passes concurrentes** : `src/actions/campaigns.ts` (FIA-2 → FIA-4 → FIA-6), `src/actions/events.ts` (FIA-1 → EXP-3), `src/components/dashboard/campaign-settings.tsx` (FIA-3 → FIA-4), `src/lib/destructive-confirm-coverage.test.ts` (EXP-3, + FIA-5 si confirmation retenue), `supabase/tests/publication_guards.test.sql` (FIA-1 → FIA-3 → FIA-6).

**Interdits transverses, quel que soit le lot** :
- Éditer une migration déjà appliquée (`20260905120000`, `20260723110000`, `20260805160000`, `20260925120000`, `20260926120000`, `20260927120000`) : `create or replace` dans la migration neuve, toujours.
- Toucher `run_campaign_schedule` hors le geste FIA-3 explicitement décrit ; toucher le CTE `ended` (`20260926120000:142-149`), l'ACL (`:229-231`), `resumeCampaignAfterBudget`, le trigger `campaigns_clear_paused_reason`.
- Ajouter une case à cocher sans l'inscrire au registre `destructive-confirm-coverage.test.ts` (elle resterait hors couverture) — et sans passer le compte, la suite rougit.
- Recopier un prédicat de tirabilité : le dépôt a déjà divergé une fois dessus (`atelier-verification-state.ts:21-29`).
- **Modèle de forme pour une case de confirmation** : `src/components/dashboard/event-editor.tsx:976-989` (`SessionRow`, `name="confirm_outstanding" value="1"`, non contrôlée) — **et surtout pas** `:696-714`, dont la case est **contrôlée et sans attribut `name`** : `conditionAutour` (`destructive-confirm-coverage.test.ts:193`) ne la trouverait jamais. Ce second bloc est un modèle de **formulation**, jamais de forme.

---

## Questions ouvertes pour le propriétaire

**Sept bloquantes à la rédaction du brief ; trois ont été tranchées le 2026-08-17** (n° 1 FIA-2, n° 3 FIA-3, n° 5 NUM-1 — voir « Arbitrages du propriétaire (2026-08-17) » en tête de document, qui fait foi). **Quatre restent ouvertes : n° 2, 4, 6 et 7.** L'écriture des lots concernés ne commence pas sans réponse — un fan-out sur un arbitrage en suspens multiplie la mauvaise réponse au lieu de la corriger une fois. Les énoncés ci-dessous sont conservés intacts : ils portent l'analyse qui a fondé chaque décision.

1. ✅ **TRANCHÉE 2026-08-17 → gardes applicatives + ADR.** *(énoncé conservé)* **FIA-2 — descendre les préconditions métier en base, ou assumer par écrit qu'elles restent applicatives ?** Une `assert_module_publishable(module, id)` appelée par les huit RPC (modèle `20260905120000:255-282`) coûte **L** : huit RPC à redéfinir, migration + pgTAP, et un risque d'enfermement à instruire (une campagne dont le dernier lot est épuisé ne pourrait plus repasser `active` après une pause). *Recommandation : gardes applicatives + ADR qui l'assume*, le geste minimal du lot backend étant commun aux deux branches. Ouvert depuis le 2026-08-07 (`docs/bugs.md:1344-1355` et `:1373-1385`). Si la branche SQL est retenue, FIA-2 devient `toucheSQL`, passe à `db-supabase` et **avant** le lot backend.
2. **FIA-2 — périmètre du prédicat campagne : « aucun lot gagnant tirable » seul, ou aussi « poids total nul » ?** L'audit ne nomme que le premier ; l'écran promet les deux (`src/lib/checklist/controles.ts:82-83`, tous deux `bloquant: true` alors qu'aucun serveur ne les oppose). Trancher **avant** d'écrire, sinon l'écran continue de promettre un refus qui n'existe pas.
3. ✅ **TRANCHÉE 2026-08-17 → branche A.** *(énoncé conservé)* **FIA-3 — branche A (`set_campaign_status` désarme `auto_schedule`) ou branche B (motif `paused_reason='manual'`) ?** *Recommandation : A*, sur trois faits mesurés : A couvre **aussi** « Restaurer en brouillon » (que B laisse ouvert), ne demande ni migration de contrainte (`20260926120000:62-68`), ni valeur d'énumération (`src/types/database.ts:26-29`), ni quatrième branche de bannière — B sans elle afficherait « budget de gains atteint (0,00 €) » sur une pause manuelle (`campaign-automation.tsx:284-338`), exactement le défaut que SD-9 vient de fermer. **Conséquence de A à assumer** : un commerçant qui pause une heure devra ré-armer la programmation à la main. Faut-il un raccourci depuis la carte Statut, ou la mention suffit-elle ?
4. **FIA-5 — refus SEC ou refus SURMONTABLE ?** Les deux formes coexistent déjà dans `deleteWheel` : sèche (`prizes.ts:456-462`), cochable (`:495-520`). Le refus sec impose de créer le lot de remplacement avant de supprimer (plafond 12 lots/roue, `prizes.ts:389-391` — toujours faisable sauf à 12/12) ; la confirmation cochable coûte un marqueur, un champ, une case et une **12ᵉ** entrée au registre. *Recommandation : refus sec* (moins de surface, et le geste de remplacement est disponible).
5. ✅ **TRANCHÉE 2026-08-17 → dater les clés, rupture assumée et écrite en tête de migration.** *(énoncé conservé)* **NUM-1 — accepter la rupture de série ?** Dater les clés rend les périodes avant/après non comparables (avant : un start par joueur **à vie** ; après : un par joueur et par jour), **sans backfill possible** — les lignes existantes gardent leur clé (`on conflict do nothing`, `20260805160000:424`). L'alternative purement additive (compteurs distincts, clés inchangées) corrige le **libellé** mais laisse le taux s'effondrer sur les cohortes de plus de 30 jours et `act-vues-sans-partie` crier sur une animation qui tourne. *Recommandation : dater, et l'écrire en tête de migration* — la mesure se répare vers l'avant.
6. **CNT-1 — quelle valeur de plafond de page ?** L'audit propose `ceil(total / pageSize)`, mais ce total disparaît précisément avec la suppression du count exact : les deux moitiés de sa correction sont en tension. **Un plafond constant est le seul chemin cohérent** ; sa valeur n'est pas tranchée. 500 pages (25 000 lignes sur Participations, 10 000 sur les listes de modules) est un ordre de grandeur plausible, pas une décision. Le même chiffre sert en TypeScript **et** dans les deux RPC. Question jointe : au-dessus du plafond, **repli silencieux** (convention du dépôt pour un paramètre d'URL hors domaine : `module-list-filters.tsx:61-63`, `p_tri` inconnu, date mal formée) ou redirection vers la dernière page ? Aucun écran n'a encore eu à replier un **numéro de page**, plus visible qu'un filtre ignoré.
7. **LIST-1 — RPC de comptage groupé, ou motif `events` ?** La RPC est le seul chemin à la fois borné **et** à un aller-retour (1 migration, 1 régénération de types) ; le motif `events` est déjà écrit et éprouvé (`events/page.tsx:74-94`), sans SQL, au prix de ≤ 20 allers-retours par table. **Fait nouveau à verser au débat** : borner les requêtes enfants casse de toute façon le `Promise.all` des quatre pages, donc le motif `events` — qui paie déjà cette séquentialisation (`events/page.tsx:60,62,74`) — ne coûte plus l'aller-retour supplémentaire qu'on lui reprochait. Si la RPC est retenue, elle part dans la migration du wagon, donc **avant** tout travail applicatif.

**Quatre non bloquantes** — à trancher au fil de l'eau, mais **avant** d'écrire dans le fichier concerné, pour ne pas y repasser :

8. **IDX-1 — étendre aux trois FK réellement découvertes** (`contest_awards.player_id`, `contest_final_standings.player_id`, `contest_final_standings.organization_id`) ? Trois lignes. Mais le recensement « 38 FK » de l'audit **n'a pas été rejoué** et sa seule désignation contrôlée s'est révélée fausse : élargir sur cette foi est une décision de périmètre. *Recommandation : oui pour ces trois-là, qui sont vérifiées ; non pour les autres.*
9. **FIA-4 — retirer aussi « Rouvrir aux joueurs » sur une pause `droit_expire` ?** La bannière dit qu'il n'y a rien à relancer à la main (`campaign-automation.tsx:304-318`) et la RPC refuserait via `assert_module_publish_allowed` : le bouton ne peut produire qu'un échec. Hors de la lettre de FIA-4, mais c'est **une condition de plus dans le même prédicat** — le refaire plus tard coûte un second passage sur le même fichier. *Recommandation : oui, maintenant.*
10. **FIA-6 — fermer aussi `active → draft` et `paused → draft` sur la campagne ?** Aucun écran ne les offre, mais ni l'un ni l'autre ne **publie** : ils dépublient. Les fermer rend la matrice exactement égale à l'écran ; les laisser respecte la règle déjà écrite « le retour en arrière n'est jamais gardé » (`20260905120000:78-83`, motivée : ne pas enfermer un commerçant qui veut arrêter). *Recommandation : les laisser ouverts, et l'écrire dans le `comment on function`.*
11. **EXP-3 — les statuts `lobby` et `ended` rejoignent-ils `live` dans la garde absolue ?** Vocabulaire disponible : `draft|lobby|live|ended|archived` (`20260727120000:167-168`). `lobby` = joueurs déjà connectés ; `ended` = classement figé, codes EVENT- émis. *Recommandation : `live` seul en garde absolue, `lobby` et `ended` par la case de confirmation qui compte les réponses.*

**À consigner dans `docs/bugs.md`, pas à corriger dans ce wagon** *(le dire explicitement plutôt que de laisser croire que la question n'a pas été posée)* :

- **FIA-1** : un jeu **archivé** dont une session est déjà en `lobby` reste pilotable — la garde ne porte que sur `draft → lobby` (choix repris de `20260905120000:596-599`). Décider que clôturer un jeu ferme ses sessions vivantes est un **autre** geste.
- **FIA-4** : `campaigns.paused_reason` reste écrivable par `authenticated` (grant asserté en `supabase/tests/publication_guards.test.sql:158-159`, re-grant `20260905120000:296-300`). Un éditeur passant par PostgREST peut effacer le motif puis appeler la RPC. **Piège si l'on révoque** : l'assertion `:158-159` rougirait — elle doit être retournée dans le **même** commit, sinon la révocation se lit comme une régression.
- **FIA-5** : `updatePrize` (`src/actions/prizes.ts:168-215`) atteint le même état injouable par `weight: 0`, `stock: 0` ou « Segment perdant » (`prize-editor.tsx:361-369`), sans rien supprimer. Fermer la seule porte nommée laisse les trois autres ouvertes.
- **NUM-1** : le bloc `sources` compte lui aussi des `count(*)` de vues datées ; il ne divise rien, il reste tel quel.
- **SCAN-1** : la famille « jamais scannés » garde son vocabulaire ; élargir `org_dashboard_summary` à `module_page_opens.open_count` (7 modules) est un geste SQL hors périmètre qui ferait bouger un chiffre suivi dans le temps.
- **EXP-2** : l'éditeur voit `rien-ouvert` mais atterrit sur `/dashboard/settings/modules`, dont les bascules sont réservées au propriétaire (`src/app/dashboard/settings/modules/page.tsx:60`). Il lit une page qu'il ne peut pas actionner ; l'alternative serait `/dashboard/discover`.
- **EXP-3** : une question déjà jouée n'est que **supprimable**, jamais retirable — le produit n'offre aucun archivage de manche.

---

## Critère de sortie du wagon

Le wagon est fini quand **tout** ce qui suit est vrai. Pas avant.

**Code — chaque correctif embarque un test qui échoue sans lui.** Onze tests neufs ou étendus, énumérés :

| Niveau | Fichier | Constat |
|---|---|---|
| pgTAP | `supabase/tests/publication_guards.test.sql` (§6, §4d, §9 neuve) | FIA-1, FIA-3, FIA-6 |
| pgTAP | `supabase/tests/automation.test.sql` (5ᵉ fixture) | FIA-3 |
| pgTAP | `supabase/tests/index_fk_couverture.test.sql` **neuf** | IDX-1 |
| pgTAP | `supabase/tests/customer_profiles_page.test.sql` (**`plan(59)` `:57` à relever**) | CNT-1 |
| pgTAP | `supabase/tests/experience_analytics.test.sql` (+ fixture roue/spins) | NUM-1 |
| pgTAP | `supabase/tests/module_list_counts.test.sql` **neuf** *(si branche RPC)* | LIST-1 |
| Vitest | `src/actions/events.start-session.test.ts` **neuf** | FIA-1 |
| Vitest | `src/actions/pronostics.test.ts`, `src/actions/campaigns.test.ts` | FIA-2, FIA-4 |
| Vitest | `src/actions/prizes.delete-prize.test.ts` **neuf** | FIA-5 |
| Vitest | `src/actions/events.question-delete.test.ts` **neuf** + registre à 11 | EXP-3 |
| Vitest | `src/lib/publication-transition.test.ts` + `src/actions/publication-refus.test.ts` | FIA-6 |
| Vitest | `src/components/dashboard/campaign-settings.test.tsx` **neuf** | FIA-3, FIA-4 |
| Vitest | `src/components/dashboard/experience-analytics.test.tsx` **neuf** | NUM-1 |
| Vitest | `src/components/dashboard/prochaine-action-destinations.test.ts` **neuf** | EXP-2 |
| Vitest | `src/components/dashboard/module-list-counts.test.ts` **neuf**, `module-list-filters.test.ts` **neuf** | LIST-1, CNT-1 |
| E2E | `e2e/dashboard-home.spec.ts` (`:86-91` et boucle interdite `:96-103`) | SCAN-1 |

**Invariants fonctionnels, vérifiables un par un** :
- Un jeu d'événement en brouillon n'ouvre pas son lobby, ni par l'écran (bouton désactivé avec sa raison) ni par appel direct (`invalid_transition`).
- Un championnat sans match et une campagne sans lot gagnant tirable ne s'ouvrent plus aux joueurs, et la RPC n'est **jamais** appelée dans ces cas.
- Une pause manuelle dans sa fenêtre n'est plus réactivée par le cron ; « Restaurer en brouillon » désarme aussi.
- « Rouvrir aux joueurs » n'apparaît plus sur une pause budget non résorbée, et un POST direct est refusé en nommant le geste correct.
- Supprimer le dernier lot gagnant tirable d'une campagne **active** est refusé, **et le refus s'affiche sur la ligne**.
- `archived → active` lève sur la campagne, `archived → draft` passe, les six autres modules publient encore depuis `archived`, et le refus s'affiche « Ce changement de statut n'est pas permis. » — pas « Mise à jour impossible ».
- Les tuiles d'analytique comptent des personnes ; deux jours de jeu d'un même joueur ne font plus deux joueurs.
- La tuile « Ouvertures de page » dit ses deux limites ; « Scans QR » n'apparaît plus nulle part.
- Aucune requête enfant de liste de module ne part sans borne de page ; aucun `count: "exact"` sur `participations` ; `?page=1000000` est borné en TypeScript **et** en base.
- Le hero et la tâche qu'il masque portent la même destination, pour les cinq faits.
- Supprimer une question de soirée exige une confirmation nommée, et est **impossible** pendant une soirée en direct.

**Vérifications** (dans l'ordre, dans `~/workspaces/lastchance`, **jamais en parallèle d'une autre session**) :
1. Après le lot DB : `./scripts/verif-complete.sh --db-seul` (reset → seed → pgTAP). Baseline actuelle : **61 fichiers / 3522 assertions PASS**.
2. Après les lots 2a/2b : `qa-verify` — typecheck 0, lint 0, suite Vitest complète, build, E2E **ciblé** (`scripts/run-e2e-local.sh`, spec `dashboard-home` + non-régression).
3. `security-review` en parallèle — le wagon touche des RPC `security definer`, une matrice d'états, un endpoint de pagination appelable en PostgREST et une garde multi-tenant : passage **obligatoire**.
4. `src/lib/release.ts:12` = `"20260928120000"` et le test `release.test.ts` vert (il compare la constante au dossier).
5. `src/lib/claude-md-budget.test.ts` vert après la mise à jour de `CLAUDE.md`.

**Documentation** (`docs-scribe`, après QA) :
- **ADR** du wagon 4 portant, nommément : l'arbitrage FIA-2 (gardes applicatives ou base) **quel qu'il soit**, la branche FIA-3 retenue, la restriction de matrice à la seule campagne avec sa raison (six écrans), la rupture de série NUM-1, le plafond de page CNT-1 et sa valeur. Citer `docs/decisions.md:5766-5775` (ADR-090, « la garde métier réelle est un arbitrage de base non tranché ici ») : c'est cette phrase que le wagon ferme.
- **`docs/bugs.md`** : fermer par écrit `:1344-1355` (pronostics) et `:1373-1385` (campagne) ; ouvrir les sept entrées « à consigner » listées ci-dessus.
- **`docs/roadmap.md`** : version du wagon 4.
- **`docs/chantier-audit-2026-08-16.md`** : ligne du wagon 4 → fusionné, SHA de squash, santé.
- **`CLAUDE.md`** : le dernier chantier **remplace** le précédent, qui part en tête de `docs/journal.md`. Ne rien empiler.
- **Six commentaires de code deviennent faux avec ce wagon et doivent être corrigés dans le même lot que le code** : `src/lib/activation/pronostics.ts:9-12` et `:16-17`, `src/lib/checklist/controles.ts:107-111`, `src/lib/publication-transition.ts:23-28`, `src/components/dashboard/atelier-verification-state.ts:9-19`, `supabase/migrations/20260905120000:91-95` (révisé dans le commentaire de la migration neuve, pas édité), `src/lib/codes-en-attente.ts:40`. Un commentaire qui ment est une dette qui se paie deux fois.

**Livraison** : PR → boucle `babysit-ci` jusqu'au vert sur le SHA de tête → squash sur `main` (ordre permanent du propriétaire) → santé post-déploiement → wagon 5.