# Audit transverse — état avant la V1 finale

**Date** : 2026-08-16 · **Dépôt** : `main` à `69774c8` · **Méthode** : 12 axes balayés en
parallèle, chaque lot de constats rouvert par un second agent chargé de le **réfuter**,
puis synthèse sur le dossier complet. 27 agents, 1 557 lectures de fichiers.

**Lecture seule intégrale** : aucun fichier modifié, aucune commande mutante, et **rien
n'a été exécuté** — ni pgTAP, ni Vitest, ni build, ni Playwright, ni `EXPLAIN`, ni
`npm audit`. Les constats de performance sont donc statiques.

**Compte** : 99 constats examinés — **94 confirmés**, 4 incertains, 1 réfuté.
Après contre-expertise : **2 P0**, **11 P1**, 43 P2, 38 P3.

Ce document croise l'audit Claude (dont les reliquats consignés dans `docs/bugs.md`) et
l'audit Codex du 2026-08-10 (Registre Codex de `docs/codex-handoff.md`), dont les huit
constats sont tranchés un par un en §4.

---

## 1. Verdict

Le produit est fonctionnellement riche et techniquement discipliné — 110 tables toutes sous RLS, 107 policies quasi toutes strictement tenant-scopées, des gardes de publication, des heartbeats de workers, des tests mécaniques qui interdisent les régressions déjà payées. Ce n'est pas un produit fragile, c'est un produit dont la couche COMMERCIALE n'a pas encore été branchée sur la couche technique. Trois familles de trous dominent, toutes en amont de la vente plutôt que dans le code métier. (1) Le catalogue vend des caractéristiques que le code n'applique pas : trois paliers de prix pour la même jauge événement, une « saison » de pronostics accordée douze mois sur toutes les compétitions, « 1000 participants par session live » écrit noir sur blanc dans plans.ts:267 alors que la pile ne tient pas la moitié, et aucun remboursement ni litige Stripe traité. (2) Le joueur peut perdre un lot déjà décrémenté du stock par trois chemins distincts : la fenêtre de reprise à 30 minutes, quatre écrans « tour offert » qui gèlent définitivement sur coupure réseau, et le mode staff du jackpot — mode par DÉFAUT en base — dont aucun écran de caisse ne peut valider une participation. (3) Deux chiffres montrés au commerçant sont faux : « Personnes ayant vu un jeu » compte des jours-joueurs divisés par des joueurs-à-vie, et l'export CSV des abonnés newsletter embarque les désinscrits sans marqueur. Rien de tout cela n'est visible aujourd'hui — la production compte UNE organisation de test et ZÉRO client réel — ce qui est précisément pourquoi le dossier ressort en P1/P2 et non en P0, et pourquoi c'est le bon moment. La bonne nouvelle : la moitié des blocages se ferment par un geste de coût S (une ligne de filtre, un try/catch, un prédicat de policy inversé, un libellé), et les chantiers lourds — cache d'état live, agrégat clients matérialisé, index avant le volume — peuvent attendre les premiers clients. La mauvaise : deux documents mentent sur des points structurants, docs/perf-report.md décrivant comme livrée une optimisation qui n'existe dans aucun fichier, et .env.example documentant la mauvaise famille de price IDs Stripe — soit exactement les deux fichiers qu'on ouvrira au moment de dimensionner et de provisionner.

---

## 2. Ce qui bloque la mise en vente (12)

Critère strict : sans ce geste, vendre expose à une fuite de données, une perte
d'argent, un chiffre faux montré au client, ou une promesse commerciale intenable.

### 1. L'export CSV des abonnés newsletter livre les désinscrits, sans marqueur

*Axe : Données personnelles et exactitude des chiffres*

**Pourquoi c'est bloquant.** Fuite de données au sens strict : des adresses de personnes qui se sont explicitement opposées quittent la plateforme dans un fichier que le commerçant réimporte typiquement dans Mailchimp ou Brevo. L'opposition RGPD est perdue au moment précis où la donnée sort, et le dommage est irréversible. Second effet : la carte annonce « N abonnés » et le fichier en contient davantage, deux chiffres contradictoires à un clic d'écart. La ligne désinscrite survit jusqu'à data_retention_months (12 mois), donc la fenêtre d'export fautif est large, pas transitoire.

**Preuve.** src/app/dashboard/participations/export/route.ts:30-35 — la requête est `.from("newsletter_subscribers").select("created_at, email, source").eq("organization_id", …)` sans aucun `.is("unsubscribed_at", null)`, et les trois colonnes exportées ne portent aucun marqueur de désinscription. Le compteur affiché juste au-dessus du lien, lui, filtre : src/app/dashboard/participations/page.tsx:134. Même prédicat partout ailleurs : 00013_growth_features.sql:78,121,160 et 20260723110000_merchant_automations.sql:488,600. La désinscription écrit un `unsubscribed_at`, elle ne supprime pas : src/app/api/newsletter/unsubscribe/route.ts:27-29.

**Le geste.** Ajouter `.is("unsubscribed_at", null)` à la requête d'export — une ligne, symétrique du compteur. Si l'export d'historique complet est un besoin, en faire une route distincte et explicite, avec une colonne `desinscrit_le` remplie.

### 2. audit_logs : les lignes sans organisation sont lisibles par tout compte connecté, tous tenants confondus

*Axe : Isolation multi-tenant, RLS, RPC*

**Pourquoi c'est bloquant.** Fuite inter-tenant exploitable AUJOURD'HUI, sans outil : n'importe quel membre — y compris un compte caisse — de n'importe quelle organisation appelle `GET /rest/v1/audit_logs?organization_id=is.null` depuis son navigateur avec son propre JWT et l'anon key publique. Ce qui fuit : identifiants client Stripe et statuts d'abonnement des organisations que la synchronisation n'a pas su rattacher. C'est la SEULE des 107 policies du schéma à contenir une échappatoire inconditionnelle, et c'est une régression documentable — la policy d'origine gardait explicitement `organization_id is not null`.

**Preuve.** supabase/migrations/00017_security_acl_rbac_integrity.sql:119-121 (vérifié à la relecture) : `drop policy "audit: select membres"` puis `create policy "audit: owner select" on public.audit_logs for select using (organization_id is null or public.is_org_owner(organization_id))` — le premier terme n'est gardé par rien. Combiné à supabase/migrations/00018_authenticated_table_grants.sql:27 `grant select on public.audit_logs to authenticated` (table entière, pas de grant de colonnes). Policy d'origine, correcte : 00005_security_hardening.sql:101. Écrivain réel de lignes à org nulle : src/app/api/stripe/webhook/route.ts:202 (`organizationId: result?.organization_id ?? null`). Client navigateur porteur du JWT : src/lib/supabase/client.ts:8-11. Aucune migration ultérieure ne la redéfinit ni ne révoque le grant.

**Le geste.** Fermer le premier terme : `using (organization_id is not null and public.is_org_owner(organization_id))`, et router les événements de portée plateforme vers `admin_audit_logs` (déjà sans policy, service_role uniquement). Ajouter dans supabase/tests/security_acl.test.sql une assertion qui insère une ligne à org nulle et vérifie qu'un membre la compte à 0 — le fichier bascule déjà en `set local role authenticated` à la ligne 891, l'assertion tient en trois lignes.

### 3. Un gain tiré mais non réclamé est perdu sans recours passé 30 minutes — stock consommé, joueur bloqué

*Axe : Parcours joueur*

**Pourquoi c'est bloquant.** Perte d'argent réelle pour le commerçant et rupture de la promesse joueur. Le stock est décrémenté DANS la transaction du tirage, mais la participation — donc le code de retrait ET l'entrée du portefeuille — n'est créée qu'au claim. Entre les deux il n'existe qu'une ligne `spins`, relisible seulement par `recoverPendingWin`, seulement 30 minutes, seulement sur le même slug. Scénario ordinaire : le joueur gagne, le formulaire demande prénom + e-mail + CGU, il est appelé à la caisse ou son navigateur in-app se ferme. Il revient 35 min plus tard, relance et lit « Vous avez déjà joué cette semaine » — il croit avoir perdu. Aucun geste de réparation n'existe : ni côté joueur, ni côté commerçant, ni côté stock.

**Preuve.** src/actions/play.ts:92 (`cutoff = Date.now() - 30*60*1000`) et :96 (`.eq("is_losing", false)`). Définition VIVANTE de la RPC : supabase/migrations/20260731120000_quick_games_skill.sql:84 — décrément du stock en :203-204, insertion UNIQUEMENT dans `public.spins` en :208-215, et garde d'éligibilité qui teste l'EXISTENCE d'un spin dans la fenêtre (:147-153 → 'limit_reached'), donc un spin non réclamé consomme la fenêtre de jeu. Le miroir du registre est accroché à `participations`, pas aux spins : supabase/migrations/20260805150000_universal_rewards.sql:644-645 — donc /portefeuille ne peut rien retrouver. Aucun des 10 crons ne touche `spins`. Jeton de claim encore plus court : src/lib/spin.ts:128 (`CLAIM_TTL_MS = 15 min`). Le commerçant ne voit que l'agrégat gagnés/réclamés (src/app/dashboard/participations/page.tsx:224-228), jamais le gagnant.

**Le geste.** Écrire le lot au REGISTRE dès le tirage (émission `reward_issuances` en statut « à finaliser »), pour que /portefeuille le montre sans limite de temps. À défaut : aligner le cutoff de `recoverPendingWin` sur la fenêtre de `play_limit`, et afficher le gain repris SANS que le joueur ait à recliquer « Lancer la roue » pour le découvrir.

### 4. Les quatre écrans « tour offert » gèlent définitivement sur une coupure réseau

*Axe : États de chargement, erreurs, formulaires*

**Pourquoi c'est bloquant.** Le joueur a DÉJÀ fourni l'effort que le module lui demandait — ouvrir une case de calendrier, finir un quiz, remplir un passeport, parrainer. Il appuie sur « Tourner », rien ne se passe, et le bouton reste cliquable mais inerte à chaque appui : ni message, ni sablier, ni sortie (la phase `ready` ne rend même pas de bouton retour). Il repart sans son lot alors que le grant peut avoir été consommé côté serveur, et le chemin de reprise `already_consumed` est inatteignable depuis l'UI une fois le spin matérialisé. C'est le pire endroit du produit pour un écran muet, et la correction coûte quatre try/catch.

**Preuve.** `grep -c catch` rend 0 sur src/components/calendar/calendar-spin-experience.tsx, src/components/quiz/quiz-spin-experience.tsx, src/components/loyalty/loyalty-spin-experience.tsx, src/components/wheel/referral-spin-experience.tsx. `busyRef.current = true` puis `await consumeXSpin(...)` nu en calendar-spin-experience.tsx:95-97, quiz:88, loyalty:99, referral:97. Aucun `unhandledrejection` dans tout src/. Le bouton reste cliquable dans l'état gelé : calendar-spin-experience.tsx:277 pose `disabled={phase === "spinning"}` et la phase reste `ready`. Chemin de reprise verrouillé : src/components/calendar/calendar-tracker.tsx:918-921 affiche « Vous avez déjà lancé la roue pour cette case », sans code et sans bouton. Correctif de référence déjà en place sur le même patron : src/components/wheel/game-shell.tsx:158-170.

**Le geste.** Envelopper l'appel aux quatre sites comme game-shell.tsx:162-169 : `catch { busyRef.current = false; setError("Connexion perdue…"); setPhase("error"); return; }`. Puis ajouter au test mécanique existant une garde refusant un `busyRef.current = true` suivi d'un `await` non enveloppé, pour que la cinquième copie ne réintroduise pas le défaut.

### 5. Jackpot : le mode « staff » est le mode par DÉFAUT et aucun écran de caisse ne peut valider une participation

*Axe : Dette, couverture de tests, livraison*

**Pourquoi c'est bloquant.** Promesse commerciale intenable sur un module entier. Toute cagnotte neuve naît en mode staff — défaut en base, et l'insert applicatif ne pose pas la colonne. Le joueur demande bien un jeton de check-in et affiche son QR ; l'action serveur qui le validerait n'a AUCUN appelant dans tout le dépôt. La page comptoir promet pourtant au commerçant « Les clients participent en caisse en présentant le QR de leur page jackpot ». Le pendant fidélité existe et fonctionne — l'asymétrie est le signal. Toutes les couches sont vertes (pgTAP prouve la RPC, l'E2E prouve le réglage) parce qu'aucune ne traverse le milieu.

**Preuve.** supabase/migrations/20260726120000_jackpot_collective.sql:85 : `validation_mode text not null default 'staff'` (relu). src/actions/jackpot.ts:112-114 insère uniquement `{organization_id, name, reward_stock: 0}`. src/actions/jackpot.ts:472 définit `participateJackpotStaff` ; grep exhaustif : aucune occurrence hors sa définition, src/actions/jackpot.test.ts et trois commentaires — aucun .tsx ne l'importe. La seule surface caisse, src/app/dashboard/redeem/page.tsx, monte `LoyaltyStaffStamp` et, pour le jackpot, uniquement `JackpotRedeemButton` — qui remet un LOT gagné, pas une participation. Promesse d'écran : src/app/dashboard/jackpot/[id]/comptoir/page.tsx:79-80 (relu). L'atelier ne compte que 2 étapes en mode staff : src/components/dashboard/atelier-jackpot-etapes.ts:58-60.

**Le geste.** Trancher : soit écrire l'écran manquant (calqué sur src/components/dashboard/loyalty-staff-stamp.tsx, réutilisant src/components/dashboard/qr-scanner.tsx), soit retirer `staff` de `jackpotValidationModeSchema` ET changer le défaut en base — l'action morte part alors avec. Dans les deux cas, un E2E qui part du QR joueur et finit sur la validation.

### 6. « 1000 participants par session live » est écrit au catalogue et n'est pas tenable

*Axe : Performance des données*

**Pourquoi c'est bloquant.** Promesse commerciale intenable, sur l'écran le plus visible du produit — devant une salle. Realtime n'est qu'un drapeau optionnel absent du dépôt ; sans lui, la cadence de poll est de 2 500 ms en `question_active`/`question_locked`, soit 400 req/s pour 1 000 joueurs contre ~150 req/s estimés disponibles. Et poser la variable ne suffit pas : le plafond de connexions Realtime laisse les joueurs non abonnés sur le repli à 2,5 s, soit encore ~217 req/s sur Pro. La moitié « lobby » du problème a bien été corrigée depuis, la moitié « question » ne l'est pas.

**Preuve.** src/lib/plans.ts:152 (`limits: { eventParticipants: 1000 }`) et :267 (le libellé vendu, « {n} participants par session live ») — relus. src/lib/event-realtime-contract.ts:74-88 : SEUL le bras `phase === "lobby"` passe par `eventLobbyDelay(maxParticipants)` ; `question_active` et `question_locked` rendent 2_500 en dur, sans aucun paramètre de jauge. src/lib/event-realtime.ts:18-21 (drapeau `EVENTS_REALTIME_ENABLED`, absent de .env.example). src/components/event/use-event-poll.ts:166-174 : `status === "SUBSCRIBED"` est la seule condition qui fait basculer sur 30 s. docs/perf-report.md:311-345 et :388-392.

**Le geste.** Trois gestes ordonnés : (1) poser `EVENTS_REALTIME_ENABLED=1` et l'ajouter à .env.example — gain immédiat pour les salles ≤ 500 ; (2) plafonner la jauge VENDABLE à 500 tant qu'un banc n'a pas prouvé le contraire, la règle vit déjà dans src/lib/plans.ts ; (3) le vrai levier, nommé dans le rapport et jamais posé : un cache serveur d'1 s par session sur la part PARTAGÉE de `event_public_state`.

### 7. Le pass « Soirée en jeu » vend trois paliers de jauge que rien ne lit

*Axe : Stripe, abonnements et droits effectifs*

**Pourquoi c'est bloquant.** Vente sur caractéristique fausse. Le webhook écrit bien `p_capacity` après validation du palier au catalogue, mais aucun code ne relit jamais cette colonne. La capacité réelle vient de `event_participant_capacity()`, qui ne lit que `organizations.plan` et `comp_access` ; et `event_sessions.max_participants` est contraint à (100, 500, 1000), donc les paliers vendus ne sont même pas stockables. Les trois prix vendent le même produit et la règle catalogue « jauge choisie avant paiement, jamais ajustée » n'a aucun objet. Nuance honnête : le client reçoit PLUS que payé (100 au lieu de 10/30/50), il n'est pas lésé — le défaut est que le différenciateur vendu n'existe pas. À trancher AVANT de créer les produits Stripe.

**Preuve.** supabase/migrations/20260805190000_security_equity.sql:238-260 — seule définition de `event_participant_capacity` dans tout le dépôt, corps relu : `when comp_access … or o.plan = 'full' then 1000 / when o.plan = 'live' then 500 / else 100`, aucune lecture d'octroi. Contrainte relue en :279-280 : `check (max_participants in (100, 500, 1000))`. Écriture morte : src/app/api/stripe/webhook/route.ts:660 (`p_capacity`), gelée ensuite par trigger (20260907120000:205-206). Seuls lecteurs de `organization_module_grants.capacity` : l'affichage admin (src/lib/admin/data.ts:302, src/components/admin/module-grants-panel.tsx:123) et `org_module_grant_state`, appelée par aucun code de production. Paliers 9/19/29 EUR : src/lib/plans.ts:569-573.

**Le geste.** Faire lire l'octroi par le calcul de capacité : une branche amont dans `event_participant_capacity` (ou dans `snapshot_event_participant_capacity`) prenant `max(g.capacity)` sur les octrois vivants du module `events`, et élargir la contrainte `event_sessions_max_participants_check` aux paliers vendus. À défaut, retirer les trois paliers du catalogue et vendre un prix unique jusqu'à ce que la jauge morde.

### 8. La « Saison de pronostics » vendue pour une compétition accorde douze mois sur toutes les compétitions

*Axe : Stripe, abonnements et droits effectifs*

**Pourquoi c'est bloquant.** Le produit vendu et le droit accordé n'ont pas le même périmètre — c'est la plus grosse fuite de revenu du catalogue add-on, et elle est invisible tant que personne ne l'exploite. Trois règles écrites au catalogue ne sont appliquées par aucun code : `resource_id` est passé en dur à `null` par le webhook, donc l'octroi couvre le MODULE entier et non un `contest_id` ; `graceDaysAfterEnd: 7` et `dataReadableDaysAfterEnd: 30` ne sont lus nulle part. L'unique borne posée est `ends_at = achat + hardCapMonths × 30` jours. Le code SAIT ce qui lui manque — son commentaire annonce « une révocation au moment de la clôture » — et cette révocation n'existe nulle part.

**Preuve.** src/app/api/stripe/webhook/route.ts:661 (`p_resource_id: null` en dur ; la RPC 20260913120000:150-155 insère ce qu'on lui passe). src/lib/octroi-termes.ts:252-264 : le cas `single-competition` pose starts_at/ends_at et laisse capacity et resource nuls ; aveu en commentaire :246-251. src/lib/plans.ts:550-553 (les trois règles déclarées). `git grep graceDaysAfterEnd|dataReadableDaysAfterEnd -- src` ne rend que la déclaration du type (plans.ts:351,358), la valeur et une assertion de test : aucun lecteur de production. `resource_id` n'est lu par aucune garde. Aucun `revoked_at` écrit à la clôture d'une compétition.

**Le geste.** Deux gestes, dans l'ordre. (1) Lier l'octroi : demander le `contest_id` au checkout, l'écrire en `resource_id`, et faire tester ce lien par la garde de publication pronostics. (2) Refermer à la finale : à `finalize_contest` ou à la clôture manuelle, poser `ends_at = min(fin + 7 jours, ends_at)` sur l'octroi lié. Sans (1), (2) n'a rien à viser.

### 9. Aucun remboursement ni litige Stripe n'est traité : droits et crédits SMS ne sont jamais repris

*Axe : Stripe, abonnements et droits effectifs*

**Pourquoi c'est bloquant.** Perte d'argent directe sur le geste commercial le plus banal — « je vous rembourse ». Le switch du webhook ne connaît que les trois `customer.subscription.*` et les trois `checkout.session.*` ; `charge.refunded`, `charge.dispute.created`, `refund.*` et `invoice.*` tombent dans un `default:` qui acquitte sans erreur. Un remboursement de Chasse laisse le module ouvert 30 jours, une Saison de pronostics jusqu'à 360 jours, un pack SMS remboursé laisse 2 000 SMS crédités avec un coût opérateur réel et irrécupérable. Aggravant : le seul rattrapage manuel est délibérément fermé — le back-office refuse de révoquer un octroi né d'un paiement en renvoyant vers Stripe, où le geste est justement sans effet.

**Preuve.** src/app/api/stripe/webhook/route.ts:81-306 — switch complet, six `case`, `default: break` en :303-305 ; aucun `charge.*`, `refund.*` ni `invoice.*`. Rattrapage manuel fermé : src/app/admin/(protected)/merchants/actions.ts:1547-1554 (« Cet octroi vient de Stripe : il se révoque depuis Stripe, pas ici »). SMS append-only, sans inverse : src/lib/admin/rbac.ts:22 et src/app/api/stripe/webhook/route.ts:803-806 (« `credit_sms_balance` n'a aucun inverse — il n'existe aucun débit administratif »).

**Le geste.** Router `charge.refunded` et `charge.dispute.created` dans le webhook : retrouver la session par `payment_intent`, révoquer l'octroi portant `source_reference = 'stripe:<session>'` avec `revoked_reason = 'remboursement'`, et pour les SMS écrire un mouvement négatif borné au solde via une RPC `debit_sms_balance` idempotente sur la même référence de paiement.

### 10. Souscrire un add-on mensuel ferme définitivement le checkout d'offre

*Axe : Stripe, abonnements et droits effectifs*

**Pourquoi c'est bloquant.** Perte d'argent : le parcours d'upsell naturel — « je teste le Passeport à 19 EUR, puis je prends Le Club » — est un cul-de-sac VISIBLE. Le bouton « Démarrer mon abonnement » reste affiché (le webhook sort avant d'écrire `stripe_event_created_at` pour un abonnement de pass pur, donc `canCheckout` reste vrai), le clic renvoie « Un abonnement est déjà ouvert pour ce compte », et la seule sortie offerte est le portail Stripe, qui ne sait pas créer d'abonnement d'offre. Le commerçant doit résilier son add-on pour pouvoir s'abonner. Aucun test ne couvre la conjonction.

**Preuve.** src/lib/stripe.ts:214-221 — `hasLiveStripeSubscription` itère `stripe.subscriptions.list({customer, status:'all'})` et rend true au premier statut non terminal, sans aucun filtre de prix ni de métadonnée ; `isTerminalSubscriptionStatus` (:188-192) ne reconnaît que `canceled` et `incomplete_expired`. Garde : src/actions/billing.ts:90-92. L'add-on mensuel part sur le MÊME customer : src/actions/billing.ts:305 (`ensureStripeCustomer`), en `mode: 'subscription'`. Bouton toujours affiché : src/app/api/stripe/webhook/route.ts:146 (sortie anticipée) → src/lib/subscription.ts:409-414 → src/components/dashboard/plan-catalog.tsx:100-107.

**Le geste.** Filtrer la garde par famille de prix : ne compter comme bloquant qu'un abonnement dont au moins un item n'est PAS reconnu par `passDepuisPrix` — la partition existe déjà (`partitionnerPrix`). Un abonnement 100 % de pass ne doit pas interdire la souscription d'une offre.

### 11. « Personnes ayant vu un jeu » compte des jours-joueurs, et sert de dénominateur au taux de conversion affiché

*Axe : Données personnelles et exactitude des chiffres*

**Pourquoi c'est bloquant.** Chiffre faux montré au commerçant, sur lequel il décide d'arrêter ou de prolonger une animation. `views` est un `count(*)` d'événements dont la clé d'idempotence est DATÉE (un par joueur et par jour), tandis que `starts`/`completions` ont une clé SANS date (un par joueur À VIE) — et l'écran divise les seconds par les premiers. Plus l'animation fidélise, plus le taux affiché s'effondre. Pire : la fenêtre d'agrégation est bornée à 30 jours alors que la clé de start est à vie, donc un joueur dont le premier start précède la fenêtre pèse jusqu'à 30 « personnes » et ZÉRO « partie commencée » — le taux ne s'effondre pas seulement, il tend vers 0 à mesure que l'animation vieillit. Le compteur qui honorerait le libellé (`unique_players`, un vrai `count(distinct)`) est calculé et relégué en sous-titre d'une autre tuile.

**Preuve.** supabase/migrations/20260805160000_experience_analytics.sql:483-484 (clé de vue datée : `'identity:view:' || new.id::text || ':' || to_char(v_local_day,'YYYYMMDD')`, trigger :527-529), :660-661 et :674-675 (clés de start/complete sans date), :1176-1183 (agrégats en `count(*)`), :1194 (`unique_players` en `count(distinct)`), :1076-1081 (la CTE `filtered` borne la fenêtre à `occurred_at >= v_since`). Libellés et ratios : src/components/dashboard/experience-analytics.tsx:75-84 contre :92-93.

**Le geste.** Brancher les pourcentages sur `unique_players`, qui existe déjà dans la même RPC, et rebaptiser `views` en « Jours de consultation » ; ou aligner la granularité des trois clés d'idempotence. Renommer aussi « Parties commencées/terminées » en « Joueurs ayant joué/terminé » — la clé est par joueur, pas par partie.

### 12. Mettre en pause une campagne programmée ne tient pas dix minutes

*Axe : Machine à états et publication*

**Pourquoi c'est bloquant.** Le commerçant perd le contrôle d'une surface joueur ouverte, et des lots continuent de sortir. `run_campaign_schedule` réactive toute campagne `auto_schedule` dont le statut est `draft` OU `paused` dès que la fenêtre est ouverte ; la seule pause qu'il respecte est `paused_reason = 'budget_reached'`. Une pause manuelle laisse `paused_reason` à null, et rien — ni l'action, ni l'écran, ni un trigger — ne désarme `auto_schedule` au moment du geste. Le commerçant qui coupe son jeu en urgence (lot erroné, stock épuisé, litige au comptoir) le voit revenir seul au prochain tick, sans notification et sans trace lisible autre qu'une ligne d'audit. Il recoupe, ça revient. Aucune bannière ne l'explique.

**Preuve.** supabase/migrations/20260723110000_merchant_automations.sql:213-221 (relu) : `where c.auto_schedule and c.status in ('draft','paused') and c.paused_reason is distinct from 'budget_reached' and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())` ; cron `*/10 * * * *` en :243-248. Les cinq transitions de l'écran ne postent que `id` + `status` : src/components/dashboard/campaign-settings.tsx:31-36 ; `updateCampaign` ne touche jamais `auto_schedule` : src/actions/campaigns.ts:213-243. Le seul trigger sur la colonne est `before insert or update OF auto_schedule` (20260906120000:242-245), donc muet sur un changement de status. Aucune fixture pgTAP `paused` à motif null : supabase/tests/automation.test.sql:140-160. Bannière absente : src/components/dashboard/campaign-automation.tsx:281 (`return null` dès que paused_reason est null).

**Le geste.** Décorréler l'arrêt volontaire du calendrier : soit `updateCampaign` pose `auto_schedule = false` quand le commerçant met en pause ou repasse en brouillon (et l'écran le dit), soit distinguer la pause manuelle par un `paused_reason = 'manual'` que seul le cron ignore. Ajouter la fixture pgTAP manquante.

---

## 3. Les chantiers (14)

Regroupements exécutables, ordonnés par rapport valeur / coût.

### [P0 · coût M] Fermer la boucle joueur → gain

**Couvre** : JOU-1, UI-1, UI-2, JOB-8, MORT-1, JOU-7

**Bénéfice.** Aucun joueur ne peut plus perdre un lot déjà décrémenté du stock. Trois trous distincts sur la même frontière tirage/claim : la fenêtre de reprise à 30 min, les quatre écrans « tour offert » sans try/catch, l'écran `blocked` sans aucune sortie. À traiter ensemble parce qu'ils partagent la même racine — le lot n'existe en base que comme une ligne `spins` que rien n'expose au joueur. Y verser MORT-1 (jackpot staff) : c'est le même dommage vu depuis l'autre bout, le joueur présente un QR que personne ne peut lire. Et consigner JOU-7 dans docs/bugs.md pour ne pas réouvrir C4 au mauvais endroit.

**Risque si ignoré.** Chaque incident coûte un lot du stock, un client mécontent au comptoir et zéro trace exploitable — le commerçant apprend le défaut par une plainte, jamais par un écran. C'est le dommage le plus certain du dossier au premier vrai trafic.

### [P0 · coût L] Aligner le catalogue Stripe sur ce que le code accorde réellement

**Couvre** : SD-1, SD-2, SD-3, SD-5, SD-6, SD-7, SD-9, SD-4, SD-8

**Bénéfice.** Aucun prix Stripe de pass n'existe encore : c'est exactement le moment où tout ceci se corrige à coût nul. Le lot ferme quatre écarts vendu/accordé (jauge événement morte, saison pronostics non bornée, add-on qui ferme le checkout d'offre, aucun remboursement traité), tranche l'arbitrage de périmètre SD-4 — tout octroi vivant ouvre le socle `wheel`, donc l'add-on Chasse à 29 EUR domine strictement l'offre d'entrée à 29 EUR/mois, personne n'a de raison rationnelle de souscrire cette dernière — et corrige .env.example, qui documente la MAUVAISE famille de price IDs. C'est le fichier qu'on lira au moment de provisionner.

**Risque si ignoré.** Chaque euro encaissé après la mise en vente devient un correctif rétroactif : clients à rembourser sur un palier fictif, droits à révoquer à la main, offre d'entrée invendable. Un provisionnement fidèle à .env.example crée les huit mauvais prix et les add-ons continuent d'afficher « pas encore disponible à la vente en ligne » sans qu'aucune erreur n'aide à comprendre pourquoi.

### [P0 · coût M] Ce qui sort de la plateforme : exports, journaux, sous-traitants

**Couvre** : NEWS-1, SEC-1 (multitenant, audit_logs), EXP-2 (téléphone dans l'export participations), IP-1, TOK-1, DOC-1 (privacy)

**Bénéfice.** Referme les six chemins par lesquels une donnée personnelle quitte le périmètre prévu : désinscrits dans l'export CSV, lignes d'audit inter-tenant lisibles par tout compte connecté, téléphone exporté d'un côté et interdit de l'autre sans qu'aucune règle ne dise laquelle est la bonne, IP de filleul stockée-jamais-lue-jamais-purgée (elle ne disparaît qu'avec la campagne, pas à douze mois), jetons à usage unique dans le CHEMIN d'URL que ni PostHog ni Sentry n'expurgent, politique de confidentialité qui ignore Brevo et Upstash. Quatre des six se ferment par un geste de coût S.

**Risque si ignoré.** C'est le commerçant qui est responsable de traitement vis-à-vis de ses clients : chaque trou lui est imputé, sur un produit qu'il découvre. Et l'export des désinscrits produit un dommage IRRÉVERSIBLE — l'opposition est perdue une fois le fichier réimporté ailleurs.

### [P1 · coût M] Des chiffres justes au tableau de bord

**Couvre** : NUM-1, SCAN-1, LIST-1, RET-1, EXP-2 (hero brouillons)

**Bénéfice.** Le commerçant décide sur ce qu'il lit. Le lot supprime un taux de conversion structurellement faux (jours-joueurs divisés par joueurs-à-vie), un libellé « Scans QR » qui promet des personnes devant la vitrine là où l'autre écran dit honnêtement « ouvertures », des compteurs de listes qui chargent la table enfant entière et peuvent être plafonnés en silence par PostgREST, une divergence de rétention qui fera fondre les participations sans toucher les tours joués au treizième mois, et un hero qui envoie sur « Aucune campagne pour l'instant » un fait compté sur neuf modules.

**Risque si ignoré.** Un chiffre faux est pire qu'un chiffre absent : il est utilisé. Le taux de conversion s'effondre à mesure que l'animation fidélise — le commerçant arrête précisément les jeux qui marchent.

### [P1 · coût L] Tenir la promesse « soirée live »

**Couvre** : EVT-1, EVT-2, DOC-1 (perf-report), JOU-5, JOU-4, TEST-1 (événement)

**Bénéfice.** Le seul chantier avec un levier technique clairement identifié et jamais posé : un cache serveur d'une seconde par session sur la part PARTAGÉE de `event_public_state` ramène 400 req/s à ~1 req/s et referme EVT-1 et EVT-2 ensemble. Y joindre l'indicateur de synchronisation joueur — le mécanisme existe entièrement, `refresh` est déjà écrit, il ne lui manque que d'être exposé et câblé sur un bouton — et le chrono fondé sur l'horloge serveur, que le quiz documente déjà comme la bonne méthode à trois modules de distance. Commencer par corriger docs/perf-report.md, qui décrit cette optimisation comme LIVRÉE avec un numéro de migration appartenant à un autre chantier, et se contredit soixante lignes plus loin.

**Risque si ignoré.** Une soirée réelle à la jauge vendue fait s'effondrer la latence devant une salle, sur l'écran le plus visible du produit. Et tant que le rapport de perf ment, quiconque le lit conclut que le levier est ailleurs — c'est exactement l'erreur que la mémoire projet appelle « lire l'archive plutôt que le catalogue vivant ».

### [P1 · coût L] Le commerçant garde le contrôle de ses publications

**Couvre** : FIA-3, FIA-4, FIA-1, FIA-2, FIA-5, FIA-6, EXP-3

**Bénéfice.** Une racine commune : les règles d'états n'existent que dans l'écran qui les affiche. Le lot pose les gardes là où le geste se produit réellement — pause manuelle non réactivable par le cron, réouverture après pause budget refusée tant que le plafond n'est pas relevé, garde « ≥ 1 question » portée par `startEventSession` (la vraie publication joueur) et non par un statut qu'aucun chemin joueur ne lit, préconditions métier pour les deux modules qui n'en ont aucune (campagne/roue et championnat), refus de supprimer le dernier lot tirable d'une campagne active, et confirmation sur la suppression d'une question de soirée.

**Risque si ignoré.** Deux mécanismes coûtent de l'argent tout de suite : une campagne pausée qui se rouvre distribue des lots, et « Rouvrir aux joueurs » sur une pause budget redémarre sur un plafond déjà épuisé. Le reste est de la fragilité : six gardes qui ne tiennent que par la discipline de l'action appelante — hypothèse déjà tombée une fois sur un septième module.

### [P1 · coût M] Modules livrés sans leur surface

**Couvre** : EXP-1 (parrainage), EXP-4, EXP-6, EXP-7, EXP-8, MORT-1

**Bénéfice.** Le croisement schéma ↔ code a sorti quatre capacités écrites en base que personne ne peut atteindre : la rupture de stock du parrainage (enregistrée, exclue même du registre universel par construction, lue par aucun écran), les plafonds `experience_economic_policies` (table + trigger armé + zéro ligne créable, et docs/audit-3-backlog.md:244 les compte livrés), deux pages de réglages écrites POUR l'éditeur — avec un message d'accueil qui lui est adressé — mais aucun lien ne l'y mène, et l'absence totale de retour sur les quatre scénarios d'e-mail automatisés.

**Risque si ignoré.** Le programme de parrainage cesse de payer sans un mot : le parrain a partagé, le filleul a joué, personne ne reçoit rien, et le commerçant l'apprend par un client mécontent alors que la base sait exactement combien de versements ont été refusés. Une ligne de backlog marquée livrée pour une capacité inatteignable garantit en outre qu'elle ne sera jamais branchée.

### [P2 · coût M] Alléger le chemin du scan QR

**Couvre** : PERF-1, PERF-3, PERF-2, PERF-5, PERF-7

**Bénéfice.** posthog-js (73 Ko gzip) et zod (63 Ko) représentent un tiers du JS gzip qu'un joueur télécharge après avoir scanné un QR, sur un téléphone en 4G dans un commerce. Attention : chaque cas a DEUX canaux, pas un — rendre `<Analytics />` paresseux ne suffit pas (`capturePlayEvent` est importé en dur par six composants joueur), et le canal `wheel-style` demande de résoudre le style côté serveur, pas un simple déplacement d'import (`zod/mini` est le geste le moins cher pour l'autre moitié). Y joindre les 121 Ko de polyfills crypto-browserify sur l'éditeur de quiz — gaspillage PUR, aucune ligne appelée dans le navigateur, et le dépôt applique déjà le motif correct ailleurs — plus la variante unique de logo servie en vignette de 56 px et l'absence de largeur sous 960 px sur les fonds.

**Risque si ignoré.** Ce sont les octets qui retardent le premier tour de roue, sur le chemin le plus chaud du produit. Rien ne casse : c'est du temps perdu à chaque scan, invisible dans les tests et visible en boutique. À ne PAS prioriser comme un défaut de conformité — posthog n'est jamais initialisé avant consentement, le module importé est inerte.

### [P2 · coût M] Frontières d'erreur et de chargement sur les surfaces joueur

**Couvre** : UI-3, PERF-4, JOU-6, UI-5, UI-4, JOU-3, UI-6

**Bénéfice.** 28 des 71 routes n'ont NI frontière d'erreur NI frontière de chargement, dont 15 des 16 surfaces joueur publiques. Le patron a été posé une fois, sur /play, et n'a suivi aucun des quinze modules livrés depuis. Un `error.tsx` + `loading.tsx` partagés au niveau d'un groupe `(player)` couvrent les quinze d'un coup plutôt que quinze copies. Y joindre le squelette du dashboard, qui promet cinq tuiles de statistiques aux 33 routes du segment — y compris l'écran de caisse utilisé devant un client — et l'enregistrement automatique sans écouteur `visibilitychange` (le dépôt sait l'écrire, il l'utilise 24 fois ailleurs).

**Risque si ignoré.** Une exception de rendu serveur remplace la page par un écran gris qui perd la police, la DA Kermesse et le logo du commerçant. Le patron étant déjà écrit et appliqué une seule fois, l'écart est difficile à défendre à ce stade. Poser la question route par route : plusieurs sont `force-dynamic` pour de bonnes raisons, d'autres beaucoup moins.

### [P2 · coût M] Accessibilité : contrastes en dur et gestion du focus

**Couvre** : A11Y-3, A11Y-4, A11Y-2, A11Y-5, A11Y-7, A11Y-1, A11Y-6

**Bénéfice.** Quatre échecs WCAG 1.4.3 francs, tous par un jeton décoratif utilisé comme couleur de texte alors que la variante texte existe et est calibrée : le compte à rebours du code de gain à 2,53:1, la valeur « Non » de la colonne consentement à 2,43:1 (celle qui décide des relances), l'unique porte de sortie clavier de la carte à gratter à 1,07:1. Plus le Studio QR, qui se déclare `aria-modal` sans jamais déplacer le focus — les tabulations suivantes parcourent une page masquée où figure un bouton « Supprimer ». Le lot doit se TERMINER par les gardes, pas par les correctifs : une règle de source interdisant `text-k-orange` et `text-zinc-400` hors `hover:`/`placeholder:`, un scan axe dans les sept specs qui n'en ont aucune, et la lecture de `results.incomplete` que le vérificateur ignore aujourd'hui.

**Risque si ignoré.** Le dépôt a déjà mesuré ce que coûte une page non scannée : 40 violations serious découvertes d'un coup. Sans garde mécanique le jeton revient — il est revenu 15 fois. Et un scan aveugle à `incomplete` repasse au vert dès qu'un contexte d'empilement fait basculer `color-contrast`, mécanisme déjà payé une fois.

### [P2 · coût M] Fiabilité des traitements de fond

**Couvre** : JOB-1, JOB-2, JOB-3, JOB-4, JOB-9, JOB-6, JOB-5

**Bénéfice.** Trois classes de défaut sur la même surface. (a) Aucun budget de temps dans les boucles : drain de 50 webhooks à 5 s chacun sous `maxDuration = 60`, 200 appels Stripe séquentiels dans expire-trials — alors que le motif correct (`startedAt` + `TIME_BUDGET_MS`, reliquat compté en `deferred`) existe déjà dans reengage et automations. (b) Aucune écriture de progression intermédiaire : la newsletter journalise UNE fois pour 1000 destinataires, une coupure au 8e lot renvoie tout ; et le plafond de 1000 est appliqué en silence, rapporté « completed », sur une RPC sans `order by` donc sur un sous-ensemble arbitraire. (c) Deux workers supervisés mais laissés `enabled = false` — dont l'expiration des essais, dont le silence est une fuite de revenu muette, et qui se rallume par un simple UPDATE d'exploitation.

**Risque si ignoré.** Le worker `jobs` est le chemin métier le plus chargé (codes SMS, newsletters, relances, automatisations, webhooks sortants) ; un seul commerçant dont l'URL webhook pend le tue en vol, et les livraisons déjà POSTées repartent en doublons au bout de 2 minutes de verrou. Un commerçant à 2500 abonnés voit « campagne envoyée, 1000 destinataires » et 1500 clients n'ont jamais rien reçu. Aucun de ces chemins n'a de test unitaire propre.

### [P3 · coût M] Dette de base de données à payer avant le volume

**Couvre** : IDX-1, EXP-1 (export clients), HUB-1, CNT-1, JKP-1, CRON-1

**Bénéfice.** Aucun de ces défauts n'est mesurable aujourd'hui (une organisation de test) et tous le deviendront d'un coup. Deux index absents sur des FK `on delete cascade` de `spins` et `participations` — supprimer une campagne ou un lot balaie la table entière DANS la transaction du commerçant. L'agrégation complète d'`org_customer_profiles_page` refaite à chaque affichage ET jusqu'à 100 fois dans un export sans `maxDuration` (même défaut vu de deux côtés : le fusionner, pas le traiter deux fois). Le jackpot qui re-rend toute la page serveur toutes les 20 s pour un compteur de quelques octets, là où le calendrier appelle une server action ciblée.

**Risque si ignoré.** Un index manquant ne se voit pas, puis se voit brutalement. L'export CSV part en timeout au premier commerçant à 10 000 clients et l'écran ne rend alors ni fichier ni message : le commerçant conclut que l'export est cassé.

### [P3 · coût M] Durcir la surface publique

**Couvre** : SEC-1 (surface, page-opens), SEC-4 (surface, prono TV), SEC-3 (surface, health), SEC-6, SEC-5 (wallet), SEC-2 (surface, skill)

**Bénéfice.** Un motif unique, déjà résolu ailleurs dans le dépôt (`progressionDevice`), à appliquer à trois routes : consommer d'abord un seau que l'appelant NE CHOISIT PAS — l'IP seule — avant le seau par ressource ; aujourd'hui `/api/page-opens` et le mode TV des pronostics composent leur seau avec un slug non résolu, donc chaque valeur inventée ouvre un seau neuf de 60 req/60 s. Y joindre les dix routes cron qui comparent `CRON_SECRET` avec `!==` alors que le helper timing-safe est déjà écrit dans le webhook SMS — dix sites, même geste, décision déjà tranchée, c'est le profil exact d'un fan-out — et le refus d'un succès de jauge quand le plancher temporel calculé vaut 0.

**Risque si ignoré.** Aucune fuite, aucune écriture forgée : le coût est en charge base sur des routes non authentifiées et non bornées. Ne PAS faire passer le seau fail-open en fail-closed : ADR-032 l'interdit explicitement sur une clé partagée dans un parcours public. Sur le mini-jeu, ce qui reste est que le réglage de difficulté du commerçant est INERTE — un défaut produit, pas un vol de lot.

### [P3 · coût M] Réparer les capteurs et retirer le code mort

**Couvre** : SEC-3 (multitenant, liste RLS), SEC-2 (multitenant, fixture mono-org), SEC-4 (multitenant, privilèges par défaut), SEC-5 (multitenant, FK composites), TEST-1, TEST-2, TEST-3, CI-1, CI-2, DETTE-1, DETTE-2, MORT-2

**Bénéfice.** Ce lot ne corrige aucun défaut : il empêche les prochains. L'activation de la RLS est asseriée par une liste de ~78 noms écrite à la main — 32 tables absentes, dont `campaigns` — alors que le dépôt sait déjà interroger le catalogue (le patron existe dans search_path_invariant.test.sql) et que le fichier AVOUE le défaut en commentaire. Le fichier de doctrine ACL ne crée qu'UNE organisation, donc ne prouve jamais qu'un membre de A ne voit rien de B sur le socle en lecture : c'est le trou par lequel la fuite audit_logs est passée, et une « Org Voisine » plus neuf `results_eq` la rendraient rouge. `npm run test:production-health` n'est câblé dans aucun workflow (une ligne). Et 647 lignes de mascotte 3D plus trois fonctions sans appelant traversent chaque PR.

**Risque si ignoré.** Une table livrée sans `enable row level security` — le geste le plus discret possible dans une migration de 300 lignes — serait immédiatement lisible et écrivable par tout compte connecté, tous tenants confondus, et la CI resterait verte. C'est un multiplicateur de risque, pas un risque : à faire APRÈS les lots P0, jamais à la place.

---

## 4. Les huit constats Codex, tranchés

Chacun rouvert dans le code plutôt que repris du document.

### C1 — CONFIRME

Confirmé, et l'énoncé Codex est même trop indulgent. Realtime n'est qu'un drapeau optionnel (`EVENTS_REALTIME_ENABLED`) absent du dépôt et de .env.example ; sans lui, `eventPollDelay` rend 2 500 ms en `question_active`/`question_locked` — SEUL le bras `lobby` passe par la jauge (src/lib/event-realtime-contract.ts:74-88), donc 1 000 joueurs = 400 req/s contre ~150 estimés disponibles. Ce que Codex ne dit pas : la moitié « lobby » A ÉTÉ corrigée depuis. Ce que le rapport de capacité ne dit pas non plus : même Realtime activé, src/components/event/use-event-poll.ts:166-174 ne bascule sur 30 s que si `status === "SUBSCRIBED"` — sur Pro, 500 connectés à 30 s plus 500 en repli à 2,5 s ≈ 217 req/s, toujours au-dessus. Poser la variable ne suffit donc pas à tenir la promesse. Celle-ci est écrite au catalogue : src/lib/plans.ts:152 et :267. Réserve : les ~150 req/s sont une transposition d'une mesure locale, pas une mesure de production.

### C2 — CONFIRME

Confirmé et précisé module par module, ce qui change le geste à poser. AUCUNE des huit RPC de transition ne porte de précondition métier : `set_campaign_status` (20260905120000:609-650) et `set_contest_status` (:445-530) vérifient rôle, vocabulaire de statut et droit d'abonnement (`assert_module_publish_allowed`), rien d'autre — trois corps lus en entier, toutes suivent le même squelette, aucune ne compte un lot, une question ou une étape. CÔTÉ APPLICATIF en revanche, six modules sur huit ONT une garde avant la RPC (quiz, calendrier, chasse, fidélité, jackpot, événement) ; deux n'en ont aucune : la campagne/roue (src/actions/campaigns.ts:188-215, `hasActiveAccess` puis RPC) et les pronostics (src/actions/pronostics.ts:341-347), dont src/lib/activation/pronostics.ts:7-20 écrit lui-même qu'« il n'existe AUCUNE précondition métier à l'ouverture d'un championnat ». Le champ `bloquant` des checklists est explicitement un récit d'écran, pas un refus serveur (src/lib/checklist/controles.ts:52-60). L'argument le plus fort n'est pas l'exploitation — un écran joueur vide, déclenché par le commerçant lui-même, annoncé par une tuile rouge — mais la fragilité : les six gardes ne tiennent que par la discipline de l'action appelante, et cette hypothèse est DÉJÀ tombée sur un septième module (mode événement : la garde « ≥ 1 question » porte sur `set_event_game_status` alors que la vraie publication joueur est `start_event_session`, dont le corps intégral — 20260905120000:546-591 — ne lit ni `event_games` ni `event_questions`).

### C3 — CONFIRME

Fait confirmé sans réserve : `evaluateSkill` retourne littéralement `{ succeeded: attempt.succeeded === true }` pour reflex et gauge (src/lib/skill.ts:138-145), booléen parsé par un simple `z.coerce.boolean()` (src/lib/validations/skill.ts:247-254). La seule contre-mesure est un plancher temporel valant 1 400 ms pour reflex et, pour gauge, `(max(0, 50 - tolerancePct)/100) × 1400 - 100` — soit ZÉRO milliseconde dès `tolerancePct = 50`, plafond du schéma. `succeeded = evaluation.succeeded && timingPlausible` est le seul verdict (src/actions/skill.ts:288-311), et part tel quel en `p_force_losing`. Les quatre autres défis sont bien évalués serveur, les 13 jeux de révélation ne sont pas concernés. MAIS le conseil de Codex — « à ne pas associer à un gain de valeur » — repose sur une prémisse fausse : la participation n'est PAS une ressource rare pour l'attaquant, `play_limit` étant clé sur le cookie joueur, renouvelable à volonté. Contourner le défi est un multiplicateur sur une boucle déjà ouverte, pas une nouvelle classe, et la perte totale reste bornée par le stock (ADR-031). Ce qui subsiste et qui est réel : le réglage de difficulté du commerçant est INERTE — celui qui règle une fenêtre à 200 ms dimensionne son stock sur un taux de réussite qui ne s'applique pas.

### C4 — CONFIRME

Confirmé, mais PAS là où Codex le place — et la reformulation est le vrai livrable. La phase de DÉFI est innocente : `startSkillChallenge` n'écrit RIEN en base (`startInner`, src/actions/skill.ts:87-160 : aucun insert, aucun update, aucun rpc — un jeton signé HMAC et un défi public), et la migration l'écrit noir sur blanc (« stock engagé seulement au tirage », 20260731120000:11,17). Un rechargement en plein défi ramène l'écran d'accueil sans rien avoir consommé ; côté roue et jeux de révélation, `recoverPendingWin` est bien appelé au montage par les quatre coques, sous garde mécanique d'ordonnancement. Traiter C4 comme un chantier « mini-jeux » ferait donc travailler sur un problème inexistant. Ce qui EST vrai, à deux endroits : (a) le jeton de défi porte un `nonce` (src/actions/skill.ts:147,155) qui n'est ni stocké ni consommé — aucune table, aucune migration ne le référence — donc un rejeu du même jeton dans sa fenêtre rappelle `perform_atomic_spin` (perte bornée à un tour, ni double gain ni double code) ; (b) surtout, la frontière tirage/claim n'a aucune reprise durable au-delà de 30 minutes. La reprise manquante n'est pas celle du DÉFI, c'est celle du GAIN — et c'est le premier bloquant de ce dossier.

### C5 — CONFIRME

Confirmé sans réserve, et c'est un des constats les mieux étayés du dossier. `useEventPoll` compte les échecs consécutifs dans `failureCountRef` (src/components/event/use-event-poll.ts:30, incrémenté :56 et :59, plafonné à 4) et s'en sert pour un backoff exponentiel jusqu'à 30 s — mais ne l'expose PAS : la signature de retour est `{ state, refresh }` (:21-24, :195). `EventPlayer` n'affiche donc aucun état de connexion, et `refresh` n'est câblé que sur `onAfterAction` et `onJoined` (event-player.tsx:96,104), jamais sur un bouton visible du joueur. À la cadence de base de 2 500 ms, quatre échecs consécutifs suffisent à atteindre 30 s, et l'écran « Préparation de la question… » (event-player.tsx:423-425) s'affiche sans aucune borne de temps. Nuance qui borne le dommage : la SOUMISSION d'une réponse, elle, a bien son retour d'erreur. Aucune donnée n'est perdue et le poll finit par rattraper — mais le silence total tombe précisément dans le scénario que ce module VEND (salle pleine, réseau saturé), et le joueur n'a aucun geste à sa disposition alors que le mécanisme de secours existe déjà, prêt à être câblé.

### C6 — CONFIRME

Vérifié directement dans le catalogue vivant plutôt que repris de bugs.md : `create policy "hunt_steps: member select" on public.hunt_steps for select to authenticated using (public.is_org_member(organization_id))` (supabase/migrations/20260724120000_treasure_hunts.sql:192-194), avec `grant select … on table public.hunt_steps to authenticated` (:218). `is_org_member` (00001_initial_schema.sql:129-140) ne teste que l'appartenance, jamais le rôle : un compte caisse lit donc bien les jetons d'étape, qui ne devraient être opposables qu'au joueur en progression. Aucune migration ultérieure ne resserre la policy. La qualification de docs/bugs.md:1453 est juste : aucun scénario d'abus concret (la caisse ne fabrique ni ne rejoue ces jetons), la portée de lecture excède simplement le besoin du rôle. Ce qui bloque n'est donc pas le code mais l'arbitrage — resserrer la policy pour exclure `caissier`, ou écrire explicitement pourquoi la lecture est sans conséquence. C'est une décision propriétaire, pas un chantier ; l'entrée est « OUVERT » depuis le 2026-08-06 et ce statut coûte déjà plus cher que l'une ou l'autre des deux réponses.

### C7 — CONFIRME

Confirmé, mais À MOITIÉ RÉSIDUEL — et c'est la moitié restante qui définit le geste. Le compteur `scans` d'`org_dashboard_summary` vaut bien `sum(qr_codes.scan_count)` (00019_atomic_security_sessions_timezone.sql:675, aucune redéfinition ultérieure), alimenté par un beacon de CHARGEMENT de page — rechargement, retour arrière et lien partagé compris — ce que la route écrit elle-même (src/app/api/page-opens/route.ts:16-19 : « un CHARGEMENT de page, pas un scan distinct »). La carte QR A ÉTÉ CORRIGÉE depuis et affiche « N ouvertures » avec une infobulle explicite (src/components/dashboard/qr-code-card.tsx:86-96). La tuile de la Vue d'ensemble, elle, dit toujours « Scans QR » sans infobulle (src/app/dashboard/page.tsx:329-332) — et l'absence n'est pas une limite du composant, puisque la tuile voisine « Tours joués » porte un `hint`. Le même nombre porte donc deux noms à deux écrans d'écart, dont l'un promet des personnes devant la vitrine : un commerçant qui lit « 40 scans » croit à 40 visiteurs et dimensionne ses lots dessus. Coût du correctif : un libellé et une infobulle recopiés de l'autre écran, aucune migration.

### C8 — CONFIRME

Confirmé et élargi au-delà du mode live et du calendrier : quatre modules sur cinq n'ont que des E2E d'affichage. Jackpot 2 tests (affichage + 404), Fidélité 2 tests, Événement live 3 tests dont le fichier avoue « pas un cycle de jeu complet » (e2e/event.spec.ts:13-16). Aucun clic ne déclenche jamais une participation cagnotte, un tampon fidélité, ni un cycle question→révélation→podium. DEUX corrections, dans les deux sens. (a) Le calendrier est mieux couvert qu'annoncé : e2e/calendar.spec.ts compte 4 tests, dont un vrai test d'ÉCRITURE (« ouvrir une case déverrouillée révèle son contenu », :83, qui clique, attend la modale et vérifie la persistance par « Revoir la case 1 ») ; seul le test :142 est en `test.fixme`, avec un motif d'isolation de seed documenté. Et e2e/atelier-modules.spec.ts:438-462 joue bien une écriture complète avec rechargement. (b) L'absence de couverture est ASSUMÉE et motivée dans les en-têtes des trois fichiers : il n'existe pas de jeton public déterministe permettant à un anonyme de valider sa propre participation. À ne PAS conclure que ce trou est celui par lequel le mode staff du jackpot est passé : un E2E de participation côté JOUEUR n'aurait jamais révélé l'absence d'un écran côté COMMERÇANT. Ce qui manquait là, c'est une assertion d'existence de la surface caisse — un test bien moins cher qu'un cycle de jeu.

---

## 5. Le détail, axe par axe (99 constats)

### Stripe, abonnements et droits effectifs

*Couverture réelle* : Lu intégralement : src/actions/billing.ts, src/lib/stripe.ts, src/lib/plans.ts, src/lib/octroi-{achat,checkout,termes}.ts, src/lib/module-grants-loader.ts, src/lib/module-acces-public.ts, src/lib/subscription.ts, src/lib/authorization.ts, src/app/api/stripe/webhook/route.ts, src/app/api/cron/expire-trials/route.ts, src/components/dashboard/plan-catalog.tsx, .env.example, et les définitions VIVANTES (dernière redéfinition vérifiée par grep) de org_has_active_access / org_has_module_access / org_has_live_module_grant / grant_module_from_payment / event_participant_capacity / set_campaign_status dans les migrations 20260805170000, 20260805190000, 20260905120000, 20260907120000, 20260908120000, 20260910120000 et 20260913120000. Vérifié aussi : les cinq actions de facturation passent toutes par requireOrganizationOwner — un éditeur ne peut déclencher AUCUN contrôle Stripe, aucun constat sur ce point. NON inspecté, et plusieurs conclusions en dépendent : la configuration du tableau de bord Stripe (événements abonnés, réglages de relance, configuration du portail client), qu'aucun fichier du dépôt ne décrit ; le back-office admin d'octroi manuel seulement survolé ; le rendu de /dashboard/settings/modules. Aucune commande de test, build, pgTAP ou Playwright n'a été lancée (consigne) : SD-6 est une lecture de chemins de code, pas un échec reproduit — d'où sa confiance moyenne.

#### `P0` SD-1 — La jauge du pass « Soirée en jeu » n'est lue par aucun code

**Constat.** Le webhook écrit bien `p_capacity` dans `organization_module_grants.capacity` après validation du palier au catalogue, mais AUCUN code ne relit jamais cette colonne. La capacité réelle d'une session live vient de `event_participant_capacity()`, qui ne lit que `organizations.plan` et `comp_access`, et `event_sessions.max_participants` est contraint à `check (max_participants in (100, 500, 1000))` — 10, 30 et 50 ne sont même pas stockables.

**Preuve.** supabase/migrations/20260805190000_security_equity.sql:238-258 (corps de event_participant_capacity, seule définition du dépôt) et :278-282 (contrainte 100/500/1000) ; src/app/api/stripe/webhook/route.ts:660 ; src/lib/plans.ts:569-573 (paliers 9/19/29 EUR) ; `git grep capacity` ne rend aucun lecteur hors admin/webhook.

**Impact.** Un commerçant qui paie 29 EUR pour le palier 50 joueurs obtient exactement ce que paie celui du palier 9 EUR : 100 joueurs (branche `else`). Les trois prix vendent un différenciateur inexistant, et la règle catalogue « jauge choisie avant paiement, jamais ajustée » est inapplicable. C'est une vente sur caractéristique fausse, sur le seul add-on à paliers.

**Correction proposée** (coût M). Faire lire l'octroi par le calcul de capacité : ajouter dans `event_participant_capacity` (ou dans `snapshot_event_participant_capacity`) une branche amont qui prend `max(g.capacity)` sur les octrois vivants du module `events`, et élargir la contrainte `event_sessions_max_participants_check` aux paliers vendus. À défaut, retirer les trois paliers du catalogue et vendre un prix unique jusqu'à ce que la jauge morde.

#### `P1` SD-2 — Aucun remboursement ni litige n'est traité

**Constat.** Le `switch` du webhook ne connaît que `customer.subscription.created/updated/deleted` et les trois `checkout.session.*`. `charge.refunded`, `charge.dispute.created`, `refund.*` et `invoice.*` tombent dans le `default:` qui « acquitte sans erreur ». Rien ne révoque un octroi ni ne reprend un crédit SMS.

**Preuve.** src/app/api/stripe/webhook/route.ts:82-306 (switch complet, `default` en :303-305) ; le commentaire de :803-806 constate déjà que « `credit_sms_balance` n'a aucun inverse — il n'existe aucun débit administratif ».

**Impact.** Un remboursement de Chasse (29 EUR) laisse le module ouvert 30 jours ; un remboursement de Saison de pronostics (39 EUR) le laisse ouvert jusqu'à 360 jours (voir SD-5) ; un pack SMS remboursé ou contesté laisse 2 000 SMS crédités, avec un coût opérateur réel et irrécupérable. Le geste commercial le plus banal — « je vous rembourse » — n'a aucune contrepartie technique.

**Correction proposée** (coût M). Router `charge.refunded` / `charge.dispute.created` dans le webhook : retrouver la session par `payment_intent`, puis révoquer l'octroi portant `source_reference = 'stripe:<session>'` (`revoked_reason = 'remboursement'`) et, pour les SMS, écrire un mouvement négatif borné au solde via une RPC `debit_sms_balance` idempotente sur la même référence de paiement.

#### `P1` SD-3 — Un add-on mensuel ferme le checkout d'offre

**Constat.** `createCheckoutSession` refuse dès que `hasLiveStripeSubscription` trouve un abonnement non terminal chez le client. Cette fonction énumère TOUS les abonnements du client, sans filtrer la famille de prix — or un add-on mensuel (Passeport 19 EUR, Parrainage 12 EUR) crée un abonnement Stripe SÉPARÉ. Le refus est donc déclenché par l'add-on lui-même.

**Preuve.** src/actions/billing.ts:90-92 (garde) ; src/lib/stripe.ts:209-221 (`hasLiveStripeSubscription` : aucun filtre de prix) ; src/app/api/stripe/webhook/route.ts:146 (un abonnement de pass PUR n'appelle jamais `apply_stripe_subscription_event_v2`, donc `stripe_event_created_at` reste null et `canCheckout` reste vrai dans `billingActions`).

**Impact.** Le parcours d'upsell naturel — « je teste le Passeport à 19 EUR, puis je prends Le Club » — est un cul-de-sac visible : le bouton « Démarrer mon abonnement » reste affiché, le clic renvoie « Un abonnement est déjà ouvert pour ce compte », et le seul bouton offert en sortie est le portail Stripe, qui ne sait pas créer d'abonnement d'offre. Le commerçant doit résilier son add-on pour pouvoir s'abonner.

**Correction proposée** (coût S). Filtrer la garde par famille de prix : ne compter comme bloquant qu'un abonnement dont au moins un item n'est PAS reconnu par `passDepuisPrix` (la partition existe déjà, `partitionnerPrix`). Un abonnement 100 % de pass ne doit pas interdire la souscription d'une offre.

#### `P2` SD-4 — Tout octroi vivant ouvre le socle « wheel »

**Constat.** `org_has_active_access` rend vrai dès qu'il existe UN octroi vivant, quel que soit son module ; `org_has_module_access('wheel')` ne demande rien d'autre que cet accès actif. Un pass Chasse ouvre donc aussi la roue, les campagnes et leur publication (`set_campaign_status` → `assert_module_publish_allowed(org,'wheel')`).

**Preuve.** supabase/migrations/20260907120000_p0_lot2_octrois_dates.sql:373-400 (branche `exists` sur tout octroi vivant) et :467-490 (`when 'wheel' then true`) ; src/lib/subscription.ts:135 (même règle côté TS) ; supabase/migrations/20260905120000_p0_gardes_publication.sql:637-638 ; src/lib/plans.ts:82-98 (Coup d'envoi, 29 EUR/mois, entitlements `[core]`) contre :480-494 (Chasse, 29 EUR / 30 jours).

**Impact.** À prix identique et durée comparable, le pass Chasse contient tout Coup d'envoi PLUS le module chasse. L'offre d'entrée est strictement dominée par un add-on : personne n'a de raison rationnelle de la souscrire, et un abonné Coup d'envoi qui le découvre se sent floué. La décision produit « l'add-on embarque les briques communes » a été implémentée comme « l'add-on embarque le produit de base entier ».

**Correction proposée** (coût M). Trancher au niveau catalogue, pas au niveau code : soit distinguer un socle technique (organisation, QR, lots, caisse) du module `wheel` monétisé — en retirant `when 'wheel' then true` de la branche accès-actif pour les organisations sans abonnement ni octroi `wheel` —, soit repositionner les prix pour que le pass 30 jours ne se compare pas au mensuel. Décision propriétaire avant toute création de produits Stripe.

#### `P1` SD-5 — La Saison de pronostics n'est bornée ni à une compétition ni aux 7 jours après finale

**Constat.** Trois règles écrites au catalogue ne sont appliquées par aucun code. `resource_id` est passé en dur à `null` par le webhook, donc l'octroi couvre le MODULE entier et non « un seul contest_id » ; `graceDaysAfterEnd: 7` et `dataReadableDaysAfterEnd: 30` ne sont lus nulle part ; l'unique borne posée est `ends_at = achat + hardCapMonths*30` jours.

**Preuve.** src/app/api/stripe/webhook/route.ts:661 (`p_resource_id: null`) ; src/lib/octroi-termes.ts:254-264 ; src/lib/plans.ts:550-553 ; `git grep graceDaysAfterEnd|dataReadableDaysAfterEnd|resource_id` ne rend aucun lecteur de production (resource_id n'est lu par aucune garde — cf. commentaire de colonne, 20260907120000:157-160) ; aucun chemin ne révoque l'octroi à la clôture d'une compétition.

**Impact.** Un commerçant paie 39 EUR « pour une compétition » et obtient douze mois de pronostics sur toutes les compétitions qu'il veut enchaîner. Le produit vendu et le droit accordé n'ont pas le même périmètre : c'est la plus grosse fuite de revenu du catalogue add-on, et elle est invisible tant que personne ne l'exploite.

**Correction proposée** (coût L). Deux gestes distincts. (1) Lier l'octroi : demander le `contest_id` au checkout, l'écrire en `resource_id`, et faire tester ce lien par la garde de publication pronostics. (2) Refermer à la finale : à `finalize_contest` (ou clôture manuelle), poser `ends_at = min(fin + 7 jours, ends_at)` sur l'octroi lié. Sans (1), (2) n'a rien à viser.

#### `P2` SD-6 — Impayé puis rachat pendant la grâce : double facturation puis webhook en 500

**Constat.** Sur `past_due`, `echeanceImpaye` pose `ends_at` sur l'octroi récurrent. Or le refus de rachat (`octroiRecurrentVivant`) et l'index unique partiel excluent tous deux les lignes dont `ends_at` est non nul : le commerçant peut donc racheter le même add-on mensuel pendant la grâce, et un SECOND octroi est créé. Au retour en `active`, l'`update ... set ends_at = null` du même chemin ne filtre par aucun abonnement et remet les DEUX lignes à `ends_at = null` — ce que l'index unique refuse.

**Preuve.** src/app/api/stripe/webhook/route.ts:994-1001 (update sans discriminant d'abonnement) ; src/lib/module-grants-loader.ts:148-155 (`.is("ends_at", null)` dans la garde de rachat) ; supabase/migrations/20260910120000_p0_lot5_recurrent_unique.sql:82-86 (prédicat de l'index : `kind='recurring' and revoked_at is null and ends_at is null`).

**Impact.** Le commerçant paie deux abonnements pour un module. Puis le webhook répond 500 en boucle sur les événements de cet abonnement ; le fichier documente lui-même la conséquence de 500 soutenus (Stripe retente trois jours puis DÉSACTIVE le point d'entrée), ce qui coupe aussi la synchronisation des abonnements d'offre. Scénario atteignable : carte expirée, puis le commerçant « reprend » son option depuis l'écran, qui le lui propose.

**Correction proposée** (coût M). Faire porter la garde de rachat sur la même définition que l'index augmentée de l'échéance : refuser aussi quand un récurrent non révoqué existe avec un `ends_at` futur. Et cibler l'écriture d'échéance sur un seul octroi (persister l'identifiant d'abonnement, ou borner l'update à la ligne la plus récente) plutôt que sur tous les récurrents du module.

#### `P2` SD-7 — .env.example documente la mauvaise famille de price IDs

**Constat.** Le canal add-on autonome — celui décrit par le propriétaire — est gouverné par `STRIPE_PRICE_ID_PASS_<MODULE>` et `STRIPE_PRICE_ID_PASS_EVENTS_<palier>` (dix variables). Aucune n'apparaît dans `.env.example`, qui documente à la place les huit `STRIPE_PRICE_ID_ADDON_*` sous le libellé « Modules vendus à l'unité en complément d'une offre » — famille qu'aucun checkout n'utilise, lue seulement pour interpréter un item d'abonnement créé à la main.

**Preuve.** .env.example:42-50 (famille ADDON documentée) ; aucune occurrence de `STRIPE_PRICE_ID_PASS` dans .env.example ; src/lib/octroi-checkout.ts:30-37 (`envAddon`/`envPalier`, la grammaire réellement lue) ; src/lib/stripe.ts:384-396 (famille ADDON, consommée uniquement par `resolveStripeEntitlements`).

**Impact.** Aucun produit Stripe n'existe encore : c'est exactement le moment où ce fichier sert de liste de courses. Un provisionnement fidèle à `.env.example` crée les huit mauvais prix, et les huit add-ons continuent d'afficher « n'est pas encore disponible à la vente en ligne » sans qu'aucune erreur n'aide à comprendre pourquoi.

**Correction proposée** (coût S). Ajouter au `.env.example` les dix variables `STRIPE_PRICE_ID_PASS_*` avec, en commentaire, le mode Stripe attendu par modèle (récurrent mensuel pour LOYALTY et REFERRAL, paiement unique pour les six autres et les trois paliers EVENTS), et requalifier le bloc ADDON existant en « interprétation d'items d'abonnement, pas un canal de vente ».

#### `P3` SD-8 — Aucun changement d'offre en libre-service — **INCERTAIN**

**Constat.** La grille d'offres n'ouvre un checkout que pour un commerçant SANS abonnement vivant ; dès qu'il en a un, toutes les autres offres basculent sur un lien `mailto:`. Aucun code n'appelle `stripe.subscriptions.update`, ni ne calcule de proration : le seul chemin de changement d'offre est manuel, hors application.

**Preuve.** src/components/dashboard/plan-catalog.tsx:87-100 (branche `hasLiveSubscription` → `mailto`) ; src/actions/billing.ts:90-92 (le POST direct est refusé de toute façon) ; `git grep subscriptions.update` ne rend rien dans src/.

**Impact.** La montée en gamme — 29 → 59 → 89 → 129 EUR, le principal levier de revenu d'un SaaS à paliers — exige un échange d'emails puis une intervention dans le tableau de bord Stripe, pour chaque client. À une organisation près c'est tenable ; à vingt, c'est la charge qui décide de la croissance. La décision est assumée en commentaire, mais elle n'a pas été rejouée depuis que quatre offres existent.

**Correction proposée** (coût M). Deux issues, à trancher avant la mise en vente : activer la configuration « changement d'abonnement » du portail Stripe (aucune ligne de code, prorata géré par Stripe, mais le catalogue des offres doit y être déclaré), ou ouvrir un chemin `subscriptions.update` avec `proration_behavior: 'create_prorations'` réservé aux cibles rendues par `upgradeTargetsFor`.

**Contre-expertise.** Je ne peux pas confirmer l'impact annoncé (« un échange d'emails par client ») sans lire la configuration du portail Stripe, qui est hors dépôt — c'est exactement le cas où le doute s'impose. Ce qui reste certain et mineur : l'écran ORIENTE vers un mailto au lieu du portail, même si le portail sait le faire. Sévérité abaissée de P2 à P3 : incohérence d'affichage à vérifier côté Stripe, pas un manque de capacité prouvé.

#### `P2` SD-9 — À l'expiration d'un pass, rien n'est mis en pause

**Constat.** La pause à l'échéance opère uniquement par ABSENCE de droit : les contextes joueurs refusent, mais le `status` de la chasse, du quiz ou de la campagne reste `active` en base et à l'écran du commerçant. Aucun cron ne repasse ces ressources en `paused`. Par ailleurs `run_campaign_schedule` (cron, service_role) fait passer en `active` toute campagne `auto_schedule` sans lire le moindre droit.

**Preuve.** src/lib/plans.ts:437-441 (`ADDON_EXPIRY_RULES`, dont « À l'expiration d'un pass, la ressource est mise en pause de façon sûre ») affiché tel quel au commerçant par src/app/dashboard/settings/modules/page.tsx:172 ; supabase/migrations/20260907120000_p0_lot2_octrois_dates.sql:500-506 (la pause « opère par absence, aucun cron ») ; supabase/migrations/20260905120000_p0_gardes_publication.sql:61-72 (run_campaign_schedule non gardé, délibérément).

**Impact.** Le commerçant lit à l'écran une promesse que rien ne tient. Concrètement : ses QR codes en circulation mènent à une page morte alors que son dashboard affiche la chasse « active », il n'a aucun signal lui disant que c'est le pass qui a expiré, et une campagne planifiée peut s'activer après l'expiration du droit — publication sans droit, silencieuse.

**Correction proposée** (coût M). Deux gestes séparés. (1) Rendre l'expiration LISIBLE plutôt que silencieuse : afficher l'état issu de `org_module_grant_state` sur la ressource elle-même (« pass expiré le … »), et poser un `paused_reason` dédié au prochain passage du commerçant. (2) Faire lire `org_has_module_access(org,'wheel')` à `run_campaign_schedule` avant activation, avec notification en cas de refus — le refus muet était le motif écrit de ne pas l'avoir fait.

### Parcours joueur

*Couverture réelle* : Inspecté en lecture intégrale ou substantielle : le parcours roue de bout en bout (src/app/play/[slug]/{page,loading,error}.tsx, src/lib/play-context.ts, src/lib/wheel-style.ts, play-experience.tsx, claim-form.tsx + RedeemCodeScreen, skill-game-shell.tsx, share-invite, turnstile-gate/widget, redeem-qr, discover-footer), le portefeuille (page + src/lib/player-wallet.ts + migration 20260822120000 + lien-portefeuille et son test), le mode live (event-player.tsx, use-event-poll.ts, event-view-state.ts, event-realtime-contract.ts, src/lib/event.ts), et côté serveur src/actions/play.ts, src/actions/skill.ts, les migrations 20260731120000 (perform_atomic_spin) et 20260805150000 (triggers du registre). Inspecté partiellement, par recherche ciblée sur la gestion d'erreur, l'état client et les jetons de thème : hunt-journey, calendar-tracker, quiz-experience + quiz-question-card, contest-experience, jackpot-tracker, loyalty-passport, proposer-passeport, page-open-beacon, passeport/commande/not-found. Ce que je n'ai PAS pu vérifier : rien n'a été exécuté (consigne de lecture seule) — les rapports de contraste de JOU-2 sont calculés à la main depuis les jetons `--color-k-*` de globals.css et les défauts de wheel-style.ts, pas mesurés dans un navigateur ; le comportement d'escalade décrit en JOU-3 s'appuie sur le contrat documenté de React 19 pour les Actions, non sur une reproduction ; les treize jeux de révélation n'ont été vus que par leur chemin partagé (GameShell/ClaimForm) et non un par un ; aucune mesure de poids de bundle, de TTFB ni de temps avant premier pixel n'a été prise. Le scanner caméra n'a été que grepé : c'est un outil commerçant, hors de mon axe.

#### `P1` JOU-1 — Un gain non réclamé est perdu passé la fenêtre de reprise (joueur, stock, commerçant)

**Constat.** Le stock est décrémenté DANS la transaction du tirage, mais la participation — donc le code de retrait ET l'entrée du portefeuille — n'est créée qu'au claim. Entre les deux il n'y a qu'une ligne `spins`, que seul `recoverPendingWin` sait relire, et uniquement pendant 30 minutes sur le même slug. Passé ce délai le joueur ne peut plus atteindre son lot par aucun chemin : /portefeuille lit `reward_issuances`, alimentée par le trigger sur `participations`, qui n'existe pas.

**Preuve.** src/actions/play.ts:92 (`cutoff = Date.now() - 30*60*1000`) ; supabase/migrations/20260731120000_quick_games_skill.sql:206-207 (`update public.prizes set stock = stock - 1` au tirage) ; supabase/migrations/20260805150000_universal_rewards.sql:643-645 (trigger `participations_reward_issuance`) ; src/actions/play.ts:238 (`perform_atomic_spin`)

**Impact.** Scénario ordinaire : le joueur gagne, le formulaire lui demande prénom + e-mail + case CGU, il est appelé à la caisse / son navigateur in-app se ferme / sa batterie lâche. Il revient 35 min plus tard, clique « Lancer la roue » et lit « Vous avez déjà joué cette semaine. Revenez la semaine prochaine ! » (`play_limit` défaut `weekly`, migration 00001:58) — donc il croit avoir perdu. Le lot est consommé du stock, le commerçant ne le voit nulle part (sa liste vit sur `participations`), et personne ne peut réparer.

**Correction proposée** (coût M). Écrire le lot au REGISTRE dès le tirage plutôt qu'au claim (émission `reward_issuances` en statut « à finaliser »), pour que /portefeuille le montre sans limite de temps ; ou, à défaut, aligner le cutoff de `recoverPendingWin` sur la fenêtre de `play_limit` et afficher le gain repris SANS que le joueur ait à cliquer « Lancer la roue » pour le découvrir. La décision consignée dans docs/bugs.md:1537-1545 ne couvre que l'appareil PARTAGÉ ; ce cas-ci est le même appareil.

#### `P2` JOU-2 — « Mes récompenses » illisible sur le thème nuit de /play

**Constat.** `LienPortefeuille` code en dur `text-k-ink` (#211d16) sans prop de thème, alors qu'il est rendu dans `RedeemCodeScreen`, qui lui reçoit bien `kermesse`. Sur le thème par défaut (`pageTheme: "nuit"`, `bgFrom #2e1065` → `bgTo #000000`) la carte est `bg-white/5` sur fond quasi noir : le lien ressort autour de 1,1:1 à 1,3:1, là où le produit vise 4,5:1. Ses voisins immédiats sur le même écran (`DiscoverFooter`, `ProposerPasseport`, `playText.*`) basculent tous sur `kermesse` — c'est un oubli isolé, pas un choix.

**Preuve.** src/components/wallet/lien-portefeuille.tsx:41 (`text-k-ink` fixe, aucune prop `kermesse`) ; src/components/wheel/claim-form.tsx:541 et 563 (rendu sans classe dans une carte dont le style dépend de `kermesse`) ; src/lib/wheel-style.ts:128,160,161 (défauts `nuit` / #2e1065 / #000000) ; à comparer à src/components/loyalty/proposer-passeport.tsx:96-99 et src/components/wheel/discover-footer.tsx:16-21

**Impact.** Sur la mécanique phare et son habillage par défaut, l'unique chemin applicatif vers /portefeuille est peint en noir sur noir. C'est très exactement le défaut que l'en-tête du composant dit fermer (« complet et atteignable par personne »). Conséquence directe sur JOU-1 : le joueur qui perd son écran n'a même pas le lien qui lui montrerait ses autres lots. Les tests existants (lien-portefeuille.test.tsx) prouvent le `href` et le nom accessible, jamais la lisibilité.

**Correction proposée** (coût S). Ajouter une prop `kermesse` à `LienPortefeuille` (classe claire `text-zinc-100`/`text-white` sinon) et la passer aux 9 sites d'appel — a minima claim-form.tsx:541/563 et referral-panel.tsx:747, les deux qui peuvent être en thème nuit. Étendre `src/lib/play-contrast.test.ts` à ce jeton pour que la garde couvre le lien comme elle couvre déjà titre/corps/mention.

#### `P3` JOU-3 — Chasse au trésor : envoi du code par e-mail sans try/catch

**Constat.** `HuntClaimForm.submit` appelle `await claimHuntReward(...)` à l'intérieur d'un `startTransition(async …)` SANS `try/catch`. C'est le seul `startTransition(async` du dépôt, et le seul formulaire joueur sans enveloppe : les six autres (claim-form, play-experience, skill-game-shell, calendar-tracker, event-player, contest-experience) portent tous le `catch` « Connexion perdue… », avec un commentaire qui explique pourquoi.

**Preuve.** src/components/hunts/hunt-journey.tsx:429-440 (aucun try) ; à comparer à src/components/wheel/claim-form.tsx:154-179 et src/components/pronos/contest-experience.tsx:476-495 ; aucun `error.tsx` sous src/app/hunt (find src/app -name error.tsx → admin, dashboard, play uniquement) ; React 19.2.8 / Next 16.2.12 (package.json)

**Impact.** Sur le réseau médiocre visé par ce formulaire, le rejet de l'action remonte jusqu'à `global-error.tsx` : toute la page est remplacée par un écran blanc « Une erreur est survenue » qui perd la direction artistique kermesse ET le code de retrait qui était affiché juste au-dessus. Le joueur croyait « optionnel — votre code reste affiché dans tous les cas » ; il ne l'a plus.

**Correction proposée** (coût S). Envelopper l'appel dans un `try/catch` posant `setError("Connexion perdue. Vérifiez votre réseau puis réessayez.")`, avec `finally` — même forme que claim-form.tsx:154-179. La promesse « votre code reste affiché » du texte de ce formulaire devient alors vraie.

#### `P3` JOU-4 — Événement live : chrono joueur fondé sur l'horloge du téléphone

**Constat.** `computeCountdown(question.startedAt, timeLimitSeconds, now)` compare un instant SERVEUR à `Date.now()` du navigateur, et `expired` pilote `disabled` sur tous les boutons de réponse. `EventPublicState` ne transporte aucun `serverNow`. Le quiz, lui, dérive son décompte des instants serveur et le documente explicitement.

**Preuve.** src/components/event/event-player.tsx:385-393 (`useNow` = `Date.now()`), :430 (`computeCountdown`), :432 (`disabled = locked || answered || countdown.expired`) ; src/components/event/event-view-state.ts (`computeCountdown` : `startMs + limitMs - nowMs`) ; src/lib/event.ts:181-189, 227-230 (aucun `serverNow` dans l'état public) ; à comparer à src/components/quiz/quiz-question-card.tsx:27-30 et 62-80 (`quizTimeRemainingMs({serverNow, startedAt, …})`)

**Impact.** Un téléphone dont l'horloge avance de plus que la durée d'une question voit `expired` vrai dès l'affichage : tous les boutons sont désactivés et l'écran annonce « ⏱ Temps écoulé. » à CHAQUE question, pour toute la session, alors que le serveur aurait accepté la réponse. Le joueur ne peut rien faire et n'a aucune explication. Symétriquement, une horloge en retard le laisse répondre après la limite pour se faire refuser sans comprendre.

**Correction proposée** (coût M). Faire porter `serverNow` par `EventPublicState` (déjà renvoyé par `getEventState`) et rebâtir le décompte sur l'écart mesuré à la réception, exactement comme `useRemainingMs` du quiz. Le composant est déjà remonté par question, l'état initial reste pur.

#### `P2` JOU-5 — Événement live : aucun indicateur de synchronisation (Codex C5)

**Constat.** `useEventPoll` compte les échecs consécutifs dans `failureCountRef` et s'en sert pour un backoff exponentiel, mais ne les expose PAS : sa signature de retour est `{ state, refresh }`. `EventPlayer` n'affiche donc aucun état de connexion, et `refresh` n'est jamais câblé sur un bouton visible du joueur (seulement `onAfterAction`). Nuance importante : la SOUMISSION d'une réponse, elle, a bien son retour (« ✅ Réponse enregistrée », « Connexion perdue. Réessayez. »).

**Preuve.** src/components/event/use-event-poll.ts:25 (type de retour), :30, :56, :59 (`failureCountRef` interne), :195 ; src/lib/event-realtime-contract.ts:12 (`EVENT_POLL_MAX_MS = 30_000`) et :89 (`base * 2 ** failures` plafonné à 30 s) ; src/components/event/event-player.tsx:65 et 91-107 (aucun rendu d'état de sync) ; src/components/event/event-player.tsx:424 (« Préparation de la question… », affiché sans limite de temps)

**Impact.** Dans une salle saturée — le scénario même de ce module — le poll passe à 30 s après 4 échecs et le téléphone reste figé sur la question précédente ou sur « Préparation de la question… », sans un mot, pendant que l'animateur a déjà changé de question. Le joueur ne sait pas s'il doit attendre, recharger, ou s'il est exclu ; il n'a aucun bouton pour forcer la mise à jour.

**Correction proposée** (coût M). Exposer `failureCountRef` (ou un booléen `desynchronise`) dans le retour du hook, et rendre dans `EventPlayer` un bandeau discret « Reconnexion… » + un bouton « Actualiser » appelant `refresh` dès le 2e échec consécutif. Le mécanisme de secours existe déjà entièrement — il ne lui manque que d'être dit.

#### `P3` JOU-6 — Huit surfaces joueur sur neuf sans écran d'attente ni écran d'erreur

**Constat.** quiz, calendar, hunt, event, jackpot, pronos, passeport, commande et portefeuille sont toutes `export const dynamic = "force-dynamic"` et aucune n'a de `loading.tsx` ni d'`error.tsx`. Le dépôt n'en compte que trois paires, pour admin, dashboard et /play.

**Preuve.** `find src/app -name "loading.tsx" -o -name "error.tsx"` → src/app/admin/(protected)/, src/app/dashboard/, src/app/play/[slug]/ uniquement ; `export const dynamic = "force-dynamic"` en src/app/quiz/[slug]/page.tsx:25, calendar/[slug]:24, hunt/[token]:18, jackpot/[id]:20, event/[code]:17, pronos/[slug]:51, passeport/[programId]:23, commande/[token]:22 ; à comparer à src/app/play/[slug]/loading.tsx et error.tsx

**Impact.** Deux conséquences pour le joueur qui scanne dans un magasin mal couvert. (1) Aucun retour visuel entre le scan et le TTFB : pas de « Préparation du jeu… », l'écran reste vide le temps du rendu serveur + aller-retour Supabase, sur des pages jamais mises en cache. (2) Une exception du composant serveur remonte à `global-error.tsx` — fond blanc, aucune identité kermesse, et surtout aucune reprise de gain annoncée, là où /play sait dire « Si un gain venait d'être tiré, il sera retrouvé automatiquement ».

**Correction proposée** (coût M). Dupliquer le couple loading/error de /play sous chacune des huit routes, en reprenant le fond kermesse de la surface concernée. Les deux fichiers de /play font 7 et 9 lignes ; le geste est identique sur les huit sites et la décision est déjà tranchée par le précédent.

#### `P3` JOU-7 — Codex C4 réfuté pour les jeux skill-gated : le démarrage d'un défi ne consomme rien

**Constat.** C4 (« pas de reprise idempotente des mini-jeux après coupure ») ne tient pas pour les six jeux de défi. `startSkillChallenge` n'écrit RIEN en base : il rend un jeton signé HMAC et un défi public, sans toucher au stock ni créer de tirage. Un rechargement en plein défi ramène simplement l'écran d'accueil, et le joueur relance sans avoir rien consommé. La soumission, elle, est protégée (`try/catch` + jeton valable 10 min).

**Preuve.** src/actions/skill.ts:87-204 (`startInner` : aucune écriture, `signSkillChallenge` à :148) ; supabase/migrations/20260731120000_quick_games_skill.sql:11 et 17 (« sans toucher au stock ni créer de gain », « stock engagé seulement au tirage ») ; src/components/wheel/skill-game-shell.tsx:194-197 (« Le start ne consomme rien ») et :217-233 (catch de la soumission)

**Impact.** Le seul trou de reprise réel du parcours joueur est celui décrit en JOU-1 — le gain déjà tiré et non réclamé. Traiter C4 comme un chantier « mini-jeux » ferait travailler sur un problème inexistant et laisserait le vrai ouvert.

**Correction proposée** (coût S). Reformuler C4 dans docs/bugs.md : la reprise manquante n'est pas celle du DÉFI mais celle du GAIN, et son correctif est JOU-1 (émission au registre dès le tirage). Aucun code à toucher côté skill.

### Machine à états et publication

*Couverture réelle* : Inspecté en lecture seule : les dernières définitions vivantes des RPC de transition et du trigger de publication (migrations `20260905120000_p0_gardes_publication.sql` et son correctif `20260906120000`), `run_campaign_schedule` (`20260723110000_merchant_automations.sql`), `set_contest_status` ; les 8 actions serveur de publication (campaigns, hunts, calendar, loyalty, quiz, jackpot, events, pronostics) ; `src/lib/activation/` (7 modules + controle.ts), `src/lib/checklist/controles.ts` et `tuiles.ts`, `src/lib/publication-transition.ts`, `src/lib/module-resources.ts`, `src/lib/experience-lifecycle.ts` ; les 9 chargeurs de contexte joueur (play, quiz, calendar, hunt, loyalty, jackpot, event, pronostics) ; les gardes de suppression (campagne, roue, lot, étape de chasse) ; l'instanciation des blueprints (`20260805180000`, vérifiée : elle insère toujours `draft`, aucun contournement). NON inspecté : aucune exécution (ni pgTAP, ni E2E, ni build) — les gardes sont donc prouvées par lecture du code, jamais observées à l'exécution ; le module Parrainage n'a été survolé que sur son chemin `enabled` ; les surfaces Place de marché, Méta-progression et Registre des récompenses sont hors de cette lecture.

#### `P2` FIA-1 — Mode événement : la garde « au moins une question » porte sur un statut qu'aucun chemin joueur ne lit

**Constat.** `setEventGameStatus` refuse d'activer un jeu sans question (`blocageActivationEvent`), mais la vraie publication joueur est `startEventSession`, qui ne lit ni le nombre de questions ni `event_games.status` — seulement le rôle et le droit d'add-on. Le joueur entre par `event_sessions.status`, jamais par `event_games.status` : la migration elle-même nomme `start_event_session` « la vraie publication joueur d'un événement » (20260905120000:539-541).

**Preuve.** src/actions/events.ts:690-718 (garde) vs src/actions/events.ts:478-489 (startEventSession) et 1176-1230 (createEventSession, aucune lecture de statut de jeu) ; supabase/migrations/20260905120000_p0_gardes_publication.sql:546-591 (start_event_session : is_org_editor + assert_module_publish_allowed, rien d'autre) ; src/lib/event-context.ts:100-103 (le refus public ne teste que event_sessions.status) ; supabase/migrations/20260805190000_security_equity.sql:734 (event_public_state ne joint jamais event_games)

**Impact.** Un commerçant crée une session sur un jeu resté en brouillon et sans une seule question, ouvre le lobby et diffuse le code : la salle rejoint un jeu vide, un soir d'événement, devant le public. La seule chose qui s'y oppose est un bandeau ambre purement textuel (« Activez le jeu… ») qui ne désactive aucun bouton. Conséquence dérivée : `RESSOURCE_MODULE` (src/lib/module-resources.ts:75) compte ce jeu comme un brouillon dans le quota alors qu'il tourne en direct.

**Correction proposée** (coût M). Faire porter la garde par le geste qui publie réellement : dans `startEventSession`, avant l'appel RPC, refuser si `event_games.status <> 'active'` (ce qui rejoue par construction la garde « ≥ 1 question » déjà appliquée à l'activation). Doubler en base dans `start_event_session` par un `join event_games` sur la session, symétrique de `assert_module_publish_allowed`, pour que la garde ne dépende plus de l'action appelante.

#### `P1` FIA-3 — Mettre en pause une campagne programmée ne tient pas dix minutes

**Constat.** `run_campaign_schedule` réactive toute campagne `auto_schedule` dont le statut est `draft` OU `paused` dès que la fenêtre est ouverte ; la seule pause qu'il respecte est `paused_reason = 'budget_reached'`. Une pause manuelle laisse `paused_reason` à null, et rien — ni l'action, ni l'écran — ne désarme `auto_schedule` au moment du geste.

**Preuve.** supabase/migrations/20260723110000_merchant_automations.sql:213-221 (`where c.auto_schedule and c.status in ('draft','paused') and c.paused_reason is distinct from 'budget_reached'`, cron `*/10 * * * *` ligne 244) ; src/components/dashboard/campaign-settings.tsx:33-37 (les cinq transitions n'écrivent que `status`) ; src/actions/campaigns.ts:215-243 (updateCampaign ne touche jamais auto_schedule)

**Impact.** Le commerçant qui coupe son jeu en urgence — lot erroné, stock épuisé, litige au comptoir — le voit revenir seul au prochain tick, sans notification et sans trace lisible autre qu'une ligne d'audit. Il recoupe, ça revient. Le même mécanisme republie aussi après la perte du droit payé (le cron ne lit aucun droit), cas nommé « lot 2, non fermé » dans 20260906120000:54-60.

**Correction proposée** (coût S). Décorréler l'arrêt volontaire du calendrier : soit `updateCampaign` pose `auto_schedule = false` quand le commerçant met en pause ou repasse en brouillon (et l'écran le dit), soit `run_campaign_schedule` cesse de réactiver ce qui a été pausé à la main — en distinguant la pause manuelle par un `paused_reason = 'manual'` que seul le cron ignore.

#### `P2` FIA-2 — C2 tranché : aucune précondition métier en SQL, et deux modules sur huit sans garde du tout

**Constat.** Vérifié module par module. Garde métier SERVEUR présente (dans l'action, avant la RPC) : quiz, calendrier, chasse, fidélité, jackpot, événement. Garde métier ABSENTE partout : roue/campagne et pronostics — leurs actions ne contrôlent que le droit d'abonnement. Et aucune des huit RPC ne porte de précondition métier : `set_campaign_status` ne vérifie que rôle + droit, `set_contest_status` non plus. Le champ `bloquant` des checklists est explicitement documenté comme un récit d'écran, pas comme un refus serveur.

**Preuve.** supabase/migrations/20260905120000_p0_gardes_publication.sql:609-652 (set_campaign_status) et :445-530 (set_contest_status) ; src/actions/campaigns.ts:189-243 (updateCampaign : hasActiveAccess puis RPC, rien d'autre) ; src/actions/pronostics.ts:340-366 ; src/lib/activation/pronostics.ts:7-20 (« il n'existe AUCUNE précondition métier à l'ouverture d'un championnat ») ; src/lib/checklist/controles.ts:56-60 et 107-111 ; src/lib/publication-transition.ts:23-28

**Impact.** Un championnat à zéro match, zéro question et zéro récompense s'ouvre aux joueurs ; une campagne sans lot tirable aussi. Surtout, les six gardes qui existent ne tiennent que par la discipline de l'action appelante : FIA-1 est précisément cette hypothèse déjà tombée. Un chemin d'écriture futur (relance, modèle, back-office) qui appelle la RPC directement publie une expérience vide sans qu'aucun test SQL ne rougisse.

**Correction proposée** (coût L). Trancher la décision produit laissée ouverte dans docs/bugs.md : soit descendre les préconditions en base (une fonction `assert_module_publishable(module, id)` appelée par les huit RPC, sur le modèle d'`assert_module_publish_allowed`), soit assumer par écrit qu'elles restent applicatives — et dans ce cas ajouter au minimum les deux gardes manquantes (`lot gagnant tirable` pour la campagne, `matière à pronostiquer` pour le championnat) dans `updateCampaign` et `updateContest`, en réutilisant les modules purs existants.

#### `P2` FIA-4 — « Rouvrir aux joueurs » efface la pause budget sans relever le plafond

**Constat.** Le bouton générique de la carte Statut est offert pour tout statut `paused`, y compris `paused_reason = 'budget_reached'`. Il appelle `updateCampaign` → `set_campaign_status('active')`, et le trigger `campaigns_clear_paused_reason` efface le motif — sans qu'aucun budget n'ait été relevé. Le chemin correct, `resumeCampaignAfterBudget`, existe justement pour l'éviter et son propre commentaire décrit la boucle qui en résulte.

**Preuve.** src/components/dashboard/campaign-settings.tsx:33-34 (`{ from: ["paused"], to: "active" }`, sans lecture de `paused_reason`) ; src/actions/campaigns.ts:594-602 (« reprendre d'abord puis échouer à relever le plafond rendrait la campagne active sur un budget déjà épuisé, donc remise en pause au premier gain : le commerçant reclique en boucle sans comprendre ») ; supabase/migrations/20260723110000_merchant_automations.sql:49-69 (trigger campaigns_clear_paused_reason) ; src/app/dashboard/campaigns/[id]/page.tsx:255-276 (les deux affordances sont à un clic l'une de l'autre)

**Impact.** La campagne repart sur un budget déjà épuisé et se remet en pause au premier gain réclamé. Pire : le motif ayant été effacé, la bannière orange qui portait le champ « Nouveau budget » disparaît — le commerçant perd l'écran qui lui aurait expliqué la cause, et n'a plus que le bouton qui vient de le tromper.

**Correction proposée** (coût S). Retirer la transition `paused → active` de `STATUS_ACTIONS` quand `paused_reason = 'budget_reached'` (la bannière porte déjà le geste correct), et refuser côté serveur dans `updateCampaign` un passage à `active` sur une campagne pausée pour budget tant que `budget_spent_cents < budget_cents` n'est pas rétabli — de sorte qu'un POST direct ne recrée pas la boucle.

#### `P3` FIA-5 — Aucune garde « dernier lot » : une campagne active peut devenir injouable en un clic

**Constat.** `deletePrize` supprime n'importe quel lot sans vérifier ni le statut de la campagne, ni le nombre de lots restants, ni l'existence d'un lot encore tirable. La garde symétrique existe pourtant un cran au-dessus : `deleteWheel` refuse de supprimer la dernière roue.

**Preuve.** src/actions/prizes.ts:230-260 (deletePrize : parse, delete, revalidate — aucune lecture d'état) vs src/actions/prizes.ts:456-462 (« Impossible de supprimer la dernière roue ») ; src/lib/play-context.ts:264-297 (le contexte rend `ok` avec `prizes: []`, aucun refus) ; src/actions/play.ts:271-273 (le joueur n'apprend l'échec qu'après avoir lancé la roue : « Plus aucun lot disponible pour le moment. »)

**Impact.** Le QR imprimé reste vivant et la campagne reste affichée « Active » au tableau de bord, mais le client qui scanne voit une roue sans segment et un refus après le geste. Le même trou couvre le cas moins visible et plus fréquent : ne rester que des lots perdants, ou un poids total nul.

**Correction proposée** (coût S). Refuser dans `deletePrize` la suppression qui laisserait zéro lot tirable (`is_losing = false` et stock non nul) sur une roue dont la campagne est `active`, avec le message de la checklist « lot-gagnant » déjà écrit ; en cas de besoin légitime, exiger la même confirmation nommée que `deleteWheel`.

#### `P3` FIA-6 — Sept des huit RPC de transition n'ont aucune matrice d'états

**Constat.** `set_contest_status` porte une matrice explicite (draft↔active, active→finished, finished→active motivée) et un verrou de clôture. Les sept autres — campagne, chasse, calendrier, fidélité, quiz, jackpot, jeu d'événement — acceptent n'importe quelle transition entre statuts valides ; le choix est assumé et écrit dans la migration, mais il fait reposer l'entièreté du vocabulaire d'états sur l'écran.

**Preuve.** supabase/migrations/20260905120000_p0_gardes_publication.sql:483-489 (matrice de set_contest_status) vs :627-641 (set_campaign_status : validation de vocabulaire, puis écriture) et :91-95 (« La matrice de transitions est volontairement PERMISSIVE hors publication ») ; src/components/dashboard/campaign-settings.tsx:33-37 (l'écran, lui, n'offre que `archived → draft`)

**Impact.** `archived → active` est atteignable par appel direct de la RPC alors qu'aucun écran ne le propose : une campagne clôturée peut redevenir publique sans repasser par le brouillon, donc sans que le commerçant relise ses lots ni sa fenêtre. Coût réel faible aujourd'hui (le geste exige un jeton d'éditeur et laisse une ligne d'audit), mais c'est le même écart que FIA-1 : la règle d'états n'existe que dans le composant qui l'affiche.

**Correction proposée** (coût M). Si la permissivité est maintenue, l'écrire comme un invariant testé (une assertion pgTAP qui énumère les transitions attendues par module) plutôt que comme un commentaire ; sinon aligner au minimum la campagne sur son écran en refusant `archived → active` direct.

### Données personnelles et exactitude des chiffres

*Couverture réelle* : Inspecté en lecture seule : src/actions/privacy.ts, src/app/privacy|legal|cookies/page.tsx, src/components/cookie-consent.tsx et cookie-preferences, src/app/api/cron/purge-data/route.ts et les six fonctions `purge_expired_*` en base (20260902120000, 20260826120000, 20260805160000, 20260805220000), les deux exports CSV (participations + clients) et leurs filtres, src/lib/sentry-scrub.ts et les trois init Sentry, src/components/analytics.tsx (PostHog), src/lib/upstash.ts, src/lib/brevo.ts, src/lib/rate-limit.ts, src/app/api/page-opens/route.ts, le schéma des 108 tables (recherche des colonnes PII et des IP), org_dashboard_summary, org_experience_analytics, org_animation_center_counts, org_weekly_digest, et les libellés de src/app/dashboard/page.tsx, customers/page.tsx, participations/page.tsx, qr-codes/page.tsx, experience-analytics.tsx, animation-center.tsx. Sur les constats déjà connus : C7 est CONFIRMÉ mais seulement à moitié résiduel (carte QR corrigée, tuile de la vue d'ensemble non) ; le téléphone dans l'export participations est CONFIRMÉ. Ce que je n'ai PAS pu vérifier : rien d'exécuté (pas de test, pas de build, pas de supabase), donc aucune purge n'a été observée à l'œuvre sur une vraie base — les rétentions sont lues dans le SQL, pas mesurées ; la configuration réelle des variables d'environnement en production (LEGAL_*, NEXT_PUBLIC_POSTHOG_KEY, UPSTASH_*, région du DSN Sentry) est hors du dépôt, donc TOK-1 et DOC-1 dépendent de ce qui est effectivement branché ; et je n'ai pas audité les surfaces joueur module par module (quiz, calendrier, jackpot, événement) pour d'autres champs collectés sans nécessité.

#### `P1` NEWS-1 — L'export CSV des abonnés newsletter embarque les désinscrits

**Constat.** L'export `?type=newsletter` sélectionne `newsletter_subscribers` sans aucun filtre sur `unsubscribed_at`, alors que TOUS les autres chemins (envoi, compteur d'écran, ciblage des automatisations) portent `unsubscribed_at is null`. Le fichier ne contient ni colonne ni marqueur permettant de distinguer un désinscrit d'un abonné.

**Preuve.** src/app/dashboard/participations/export/route.ts:30-35 (aucun `.is("unsubscribed_at", null)`) contre src/app/dashboard/participations/page.tsx:130-134 (le compteur affiché juste au-dessus du lien l'applique) et le lien lui-même page.tsx:265-270. Même prédicat en base : 00013_growth_features.sql:78,121,160 ; 20260723110000_merchant_automations.sql:488,600.

**Impact.** Le commerçant télécharge des adresses de personnes qui se sont explicitement opposées, sans le savoir, et les réimporte typiquement dans Mailchimp/Brevo — l'opposition RGPD est perdue au moment précis où elle sort de la plateforme. Second effet : la carte annonce « N abonnés » et le fichier en contient davantage, deux chiffres contradictoires à un clic d'écart.

**Correction proposée** (coût S). Ajouter `.is("unsubscribed_at", null)` à la requête d'export (une ligne, symétrique du compteur). Si le besoin d'exporter l'historique complet existe, en faire un export distinct et explicite, avec une colonne `desinscrit_le` remplie.

#### `P1` NUM-1 — « Personnes ayant vu un jeu » compte des jours-joueurs, pas des personnes

**Constat.** `views` est un `count(*)` d'événements `experience_viewed`, dont la clé d'idempotence est `identity:view:<membership>:<YYYYMMDD>` : un événement par joueur ET PAR JOUR. `starts`/`completions` ont au contraire une clé sans composante de date (`activity:start:<kind>:<experience>:<player_key>`), donc un événement par joueur À VIE. Les deux sont divisés l'un par l'autre dans l'écran. Le compteur qui honorerait le libellé (`unique_players`, un vrai `count(distinct)`) est calculé mais n'est utilisé que comme sous-titre d'une autre tuile.

**Preuve.** supabase/migrations/20260805160000_experience_analytics.sql:484 (clé de vue datée), :661 et :675 (clés de start/complete sans date), :1176-1183 (agrégats en `count(*)`), :1194 (`unique_players` en `count(distinct)`) ; libellés et ratios dans src/components/dashboard/experience-analytics.tsx:75-93.

**Impact.** Un joueur fidèle qui revient 10 jours pèse 10 « personnes » et 1 « partie commencée » : plus l'animation fidélise, plus le taux de conversion affiché s'effondre. Sur une roue jouée par 40 personnes revenues 3 jours chacune, l'écran annonce « 120 personnes », « 40 parties commencées — 33 % des personnes », là où la réalité est 40 personnes et 100 %. Le commerçant décide d'arrêter une animation sur un taux inventé.

**Correction proposée** (coût M). Étiqueter `views` pour ce qu'il est (« Jours de consultation ») et brancher les pourcentages sur `unique_players`, qui existe déjà dans la même RPC ; ou aligner la granularité des trois clés d'idempotence. Renommer aussi « Parties commencées/terminées » en « Joueurs ayant joué/terminé » — la clé est par joueur, pas par partie.

#### `P2` RET-1 — La table `spins` n'est purgée par rien, et sa rétention diverge de celle des participations

**Constat.** Aucune migration ni aucun cron ne supprime de lignes de `public.spins` (aucun `delete from public.spins` dans les 127 migrations). Elle porte `player_key`, l'empreinte de l'appareil qui relie toutes les parties d'une même personne — une donnée pseudonyme, donc personnelle. `purge_expired_personal_data` supprime en face les `participations` à `data_retention_months` (12 mois par défaut).

**Preuve.** supabase/migrations/00002_spins.sql:8-18 (schéma, `player_key text not null`) ; supabase/migrations/20260902120000_cancel_reward_on_source_delete.sql:375-378 (les participations partent, jamais les spins) ; `grep -rn "delete from public.spins" supabase/migrations` → aucun résultat. La politique affichée ne parle que des participations : src/app/privacy/page.tsx:19.

**Impact.** Deux dégâts. (1) La trace comportementale complète d'un joueur survit indéfiniment alors que la politique publiée promet douze mois. (2) Les quatre tuiles « Vos résultats » mélangent deux rétentions : « Scans QR », « Tours joués » et « Lots gagnés » sont à vie, « Participations » et la « Répartition des gains » tombent au premier passage de purge. Au treizième mois d'exploitation, le commerçant verra ses participations et son graphique fondre du jour au lendemain sans explication, tours joués inchangés.

**Correction proposée** (coût M). Ajouter la suppression des `spins` hors rétention dans `purge_expired_personal_data` (même borne que les participations, en s'assurant que `referral_signups.proof_spin_id` cascade proprement) ; et borner les tuiles « Vos résultats » à une fenêtre explicite plutôt qu'au « tout l'historique », pour que les quatre chiffres parlent de la même période.

#### `P2` IP-1 — Une adresse IP de client est stockée, jamais lue, et visible de toute l'équipe

**Constat.** `referral_signups.ip` reçoit l'IP brute du filleul à chaque parrainage validé. Aucune requête du produit ne la relit : la colonne n'apparaît que dans son `create table` et dans l'`insert` de `validate_referral`. Elle est pourtant couverte par `grant select on table public.referral_signups to authenticated` et une policy `is_org_member`, donc lisible par n'importe quel membre — y compris un compte de caisse.

**Preuve.** supabase/migrations/20260729120000_referral.sql:221 (colonne), :842-844 (écriture), :322-324 (policy `is_org_member`), :348 (grant table entière). Aucun `select` de cette colonne ailleurs dans supabase/ ni dans src/.

**Impact.** Donnée personnelle collectée sans finalité active (le commentaire dit lui-même « facultative, jamais une clé de rate-limit »), conservée jusqu'à `data_retention_months` (12 mois), et exposée à un rôle qui n'a aucune raison de la voir. C'est la définition d'un manquement à la minimisation, sur la seule table du produit qui stocke une IP côté joueur.

**Correction proposée** (coût S). Cesser d'écrire la colonne (passer `p_ip => null` dans `validate_referral`) et la supprimer, ou à défaut la retirer du `grant select` accordé à `authenticated` et la neutraliser après quelques jours. Si l'anti-abus la justifie, stocker un hash tronqué, pas l'adresse.

#### `P2` SCAN-1 — La tuile « Scans QR » du tableau de bord n'a pas suivi le renommage en « ouvertures »

**Constat.** Confirme partiellement le constat Codex C7. Le compteur `scans` de `org_dashboard_summary` vaut `sum(qr_codes.scan_count)`, alimenté par le beacon de chargement de page — rechargement, retour arrière et lien partagé compris. La carte QR a été corrigée et affiche « N ouvertures » avec une infobulle explicite ; la tuile de la vue d'ensemble, elle, dit toujours « Scans QR », sans infobulle.

**Preuve.** src/app/dashboard/page.tsx:330-332 (`label: "Scans QR"`) ; valeur définie en supabase/migrations/00019_atomic_security_sessions_timezone.sql:676 ; la correction déjà appliquée ailleurs en src/components/dashboard/qr-code-card.tsx:86-96 ; la nature réelle du compteur en src/app/api/page-opens/route.ts:17-20.

**Impact.** Le même nombre porte deux noms à deux écrans d'écart, dont l'un promet des personnes devant la vitrine. Un commerçant qui lit « 40 scans » croit à 40 visiteurs et dimensionne ses lots là-dessus ; il verra ensuite « 40 ouvertures » sur la page QR et ne saura pas lequel des deux croire.

**Correction proposée** (coût S). Reprendre le libellé et l'infobulle de `qr-code-card.tsx` : « Ouvertures de page » + le même `title`. Un seul mot à changer, aucune migration.

#### `P2` TOK-1 — Les jetons à usage unique vivent dans le CHEMIN d'URL, que ni PostHog ni Sentry n'expurgent

**Constat.** Deux parcours joueur portent un secret porteur dans le chemin : `/commande/<token>` (jeton de QR de commande, à usage unique) et `/hunt/<token>` (jeton d'étape de chasse). `<Analytics />` est monté dans le layout racine avec `capture_pageview: true`, donc PostHog reçoit l'URL complète dès que le visiteur accepte. Côté Sentry, l'assainisseur est explicitement conçu pour ne nettoyer que la query : « le chemin est conservé, seule la valeur des paramètres sensibles est remplacée ».

**Preuve.** src/components/analytics.tsx:22-31 monté par src/app/layout.tsx:37 ; src/lib/sentry-scrub.ts:16-19 et :180-192 (`scrubUrl` garde `base`) ; src/instrumentation-client.ts:17-22 (traces à 10 %, navigations tracées) ; jetons : supabase/migrations/20260915120000_loyalty_order_codes.sql:80 et src/app/commande/[token]/page.tsx:29-35.

**Impact.** Un jeton qui vaut un tampon de fidélité — ou la validation d'une étape de chasse sans être sur place — se retrouve en clair dans un service tiers d'analytique et dans les traces d'erreur. Le scrubber attrape déjà les codes de retrait préfixés (`GAIN-…`) par un motif dédié ; ces deux familles-là, sans préfixe, passent au travers.

**Correction proposée** (coût M). Passer `capture_pageview: false` et déclarer les vues à la main avec un chemin masqué (`/commande/[token]`), ou fournir un `sanitize_properties`. Côté Sentry, ajouter au `scrubUrl` un remplacement des segments de chemin qui suivent `/commande/` et `/hunt/`.

#### `P2` DOC-1 — La politique de confidentialité ne mentionne ni le canal SMS, ni Brevo, ni Upstash

**Constat.** La liste des sous-traitants publiée est « Supabase, Cloudflare, Resend, Stripe, Sentry et, après consentement, PostHog ». Or le produit envoie des SMS via Brevo (le numéro de téléphone part chez un tiers) et peut router ses compteurs anti-abus vers Upstash, dont la clé de seau contient l'adresse IP du visiteur en clair. Aucune section de la politique ne parle du canal SMS, alors qu'il collecte un consentement daté et versionné en base.

**Preuve.** src/app/privacy/page.tsx:16 (liste des prestataires) et :19 (droits) ; src/lib/brevo.ts:18 (`https://api.brevo.com/v3/transactionalSMS/send`) ; src/lib/upstash.ts:33 (`const key = \`rl:${bucket}:…\``, le bucket contenant l'IP — voir src/lib/rate-limit.ts:507-509 et src/app/api/page-opens/route.ts:55,83) ; consentement SMS en base : supabase/migrations/20260826120000_sms_e164_and_send_gate.sql:868.

**Impact.** Une politique de confidentialité qui omet deux destinataires de données personnelles est incomplète au sens de l'article 13 — et c'est le document sur lequel le commerçant s'appuie, puisque c'est LUI le responsable de traitement vis-à-vis de ses clients. La page cookies ne mentionne pas non plus le stockage local `lc:analytics-consent` ni celui de PostHog.

**Correction proposée** (coût S). Ajouter Brevo et Upstash (et Vercel) à la liste des prestataires, et une section « Canal SMS » décrivant la finalité, le consentement et la conservation déjà implémentés. Aucun code applicatif à toucher.

#### `P3` EXP-2 — L'export des participations livre le téléphone que l'export clients refuse délibérément

**Constat.** Confirme un constat déjà consigné sans action. `/dashboard/customers/export` ne rend pas le téléphone, et son en-tête l'assume comme « une décision d'exposition de données personnelles prise en base ». `/dashboard/participations/export`, garde identique (propriétaire seul) et même écran de destination, l'exporte en clair dans une colonne dédiée.

**Preuve.** src/app/dashboard/participations/export/route.ts:79 (`select … phone …`), :97 (en-tête `telephone`), :113 (valeur) contre src/app/dashboard/customers/export/route.ts:21-23 (le commentaire qui pose la règle inverse).

**Impact.** La même donnée est protégée d'un côté et distribuée de l'autre, sans qu'aucune règle ne dise laquelle est la bonne. Un fichier CSV de numéros de téléphone quitte la plateforme sans traçabilité ; la décision de l'exclure ailleurs perd tout effet.

**Correction proposée** (coût S). Trancher la règle et l'appliquer aux deux exports. Si le téléphone doit sortir (le commerçant l'a collecté, il en est responsable), documenter pourquoi dans l'en-tête de `customers/export` ; sinon le retirer des trois lignes ci-dessus.

#### `P3` LEG-1 — Mentions légales : identité de repli servie comme si elle était réelle — **INCERTAIN**

**Constat.** Vérification demandée : AUCUNE raison sociale, adresse, SIREN ou capital n'a été inventé dans le code. La page lit quatre variables d'environnement. Mais les replis rendent une page qui a l'air complète : à défaut de configuration, l'éditeur s'affiche « LastChance » avec `contact@lastchance.app`, et le paragraphe adresse disparaît silencieusement au lieu de signaler qu'il manque. Aucun SIREN/RCS ni directeur de publication n'est prévu, même comme variable.

**Preuve.** src/app/legal/page.tsx:7-14 (`?? "LastChance"`, `?? "contact@lastchance.app"`, `address ? … : ""`) ; variables déclarées vides en .env.example:109-112 ; le même repli de contact en src/lib/support.ts:12.

**Impact.** Tant que les variables ne sont pas renseignées en production, le site publie des mentions légales qui ne permettent d'identifier personne — sans que rien, ni en page ni en CI, ne le signale. Le jour où un vrai client s'inscrit, c'est un manquement LCEN silencieux et une adresse de contact qui n'existe peut-être pas.

**Correction proposée** (coût S). Faire échouer le build (ou afficher un bandeau visible en production) si `LEGAL_ENTITY_NAME`/`LEGAL_POSTAL_ADDRESS` sont absents, plutôt que de retomber sur un nom générique ; prévoir les champs SIREN/RCS et directeur de publication dans la même famille de variables. Les valeurs restent un geste du propriétaire.

**Contre-expertise.** Je ne peux pas trancher sans lire l'environnement de production, et la consigne est de ne rien exécuter de mutant ni d'appeler Vercel : le défaut n'existe QUE si les quatre variables sont vides en production. `.env.example` est un gabarit, il ne prouve rien sur le déploiement. Ce qui est certain et vérifié : rien n'est inventé dans le code (la question posée à l'auditeur), et aucun garde-fou — ni en page, ni en CI, ni dans src/lib/env.ts pour ces variables — ne signalerait une configuration manquante. C'est le vrai constat, et il vaut P3.

### Isolation multi-tenant, RLS, RPC

*Couverture réelle* : Lecture seule, sans exécution SQL : j'ai reconstruit l'état FINAL de chaque objet en rejouant les 127 migrations dans l'ordre (script Node dans le scratchpad) plutôt qu'en lisant les migrations d'origine — 110 tables créées, 110 avec `enable row level security` (aucune oubliée), 107 `create policy` (toutes nomment un prédicat `is_org_member/owner/editor`), 91 fonctions exécutables par `authenticated` et ZÉRO par `anon`. J'ai vérifié le corps de la dernière définition des 76 RPC marchandes non triviales : toutes portent une garde d'organisation sauf `create_organization` et `accept_team_invitation`, gardées par `auth.uid()` par construction ; les 37 qui prennent `(p_organization_id, id_entité)` re-joignent toutes l'entité sur l'organisation. Côté applicatif j'ai balayé les 247 requêtes du client service_role dans `src/actions`, `src/app` et `src/lib` et lu les chemins publics (`*-context.ts`, `/api/page-opens`, webhook Stripe, back-office admin). CE QUE JE N'AI PAS PU FAIRE : exécuter pgTAP ou interroger la base (interdit par la consigne), donc aucun constat n'est prouvé par une requête réelle — en particulier je ne peux pas mesurer combien de lignes `audit_logs` portent aujourd'hui `organization_id is null` en production, ni vérifier les privilèges par défaut réels du bootstrap hébergé (que la migration 20260720200500 dit différent du local).

#### `P2` SEC-1 — La policy d'audit_logs ouvre inconditionnellement les lignes sans organisation à tout compte connecté

**Constat.** La policy vivante est `for select using (organization_id is null or public.is_org_owner(organization_id))` — le premier terme n'est gardé par rien. Combiné au `grant select on public.audit_logs to authenticated`, n'importe quel utilisateur connecté (propriétaire, éditeur ou caissier, de n'importe quel tenant) peut appeler `GET /rest/v1/audit_logs?organization_id=is.null` depuis son navigateur avec son propre JWT et l'anon key publique. C'est la SEULE des 107 policies du schéma qui contienne une échappatoire inconditionnelle ; toutes les autres sont strictement `is_org_*(organization_id)`.

**Preuve.** supabase/migrations/00017_security_acl_rbac_integrity.sql:120 (policy) + supabase/migrations/00018_authenticated_table_grants.sql:27 (grant select à authenticated). Écrivains de lignes à org NULL : src/app/api/stripe/webhook/route.ts:202 (`organizationId: result?.organization_id ?? null`, action `subscription.sync`, metadata `{event, status, customer_id}`) et src/actions/auth.ts:216 (action `organization.create`, metadata `{slug}`). Client navigateur porteur du JWT : src/lib/supabase/client.ts.

**Impact.** Fuite inter-tenant de lignes de journal de portée plateforme : identifiants client Stripe et statuts d'abonnement des organisations que la synchronisation n'a pas su rattacher, slugs d'établissements demandés par d'autres commerçants. Le volume est aujourd'hui probablement faible (bêta, une org de test), mais le canal est ouvert et toute future écriture d'audit à org nulle devient lisible par tous les tenants sans que rien ne le signale.

**Correction proposée** (coût S). Remplacer le premier terme par une condition fermée : `using (organization_id is not null and public.is_org_owner(organization_id))`, et router les événements de portée plateforme vers `admin_audit_logs` (déjà sans policy, service_role uniquement). Ajouter dans security_acl.test.sql une assertion qui insère une ligne à `organization_id is null` puis vérifie qu'un membre la compte à 0 — le fichier bascule déjà en `set local role authenticated` à la ligne 891, l'assertion tient en trois lignes.

#### `P3` SEC-3 — L'activation de la RLS est vérifiée par une liste de noms écrite à la main, pas par le catalogue

**Constat.** Toute l'isolation repose sur « RLS active partout » — c'est elle qui refuse par défaut sur les tables sans policy. Or cette règle est asseriée par une énumération manuelle de ~78 noms de tables. 32 des 110 tables du schéma n'y figurent pas, dont `campaigns` (la table la plus centrale du produit), `contest_awards`, `newsletter_campaigns`, `organization_module_grants`, `module_page_opens`, les quatre tables `referral_*` et les quatre `experience_blueprint*`/`experience_economic_policies`. Aujourd'hui les 110 portent bien la RLS ; rien ne le garde demain.

**Preuve.** supabase/tests/security_acl.test.sql:560-634 (l'énumération : `relrowsecurity from pg_class where oid = 'public.<nom>'::regclass`, un `select ok(...)` par nom). Le patron à copier existe déjà dans le dépôt : supabase/tests/search_path_invariant.test.sql:37-75, qui interroge pg_proc et ajoute un contrôle de PORTÉE pour ne pas verdir sur un ensemble vide.

**Impact.** Une table neuve livrée sans `enable row level security` — le geste le plus discret possible dans une migration de 300 lignes — serait immédiatement lisible et écrivable par tout compte connecté, tous tenants confondus, via PostgREST, et la CI resterait verte. Le dépôt a déjà remplacé deux listes de ce type par une requête (search_path, storage) pour exactement cette raison.

**Correction proposée** (coût S). Une assertion : `select is((select coalesce(string_agg(c.relname, ', ' order by c.relname),'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), '')`, plus un `cmp_ok(count(*), '>=', 110)` de contrôle de portée. L'énumération actuelle peut alors être supprimée.

#### `P3` SEC-2 — security_acl.test.sql ne prouve que la séparation des rôles : une seule organisation dans sa fixture

**Constat.** Le fichier qui porte la doctrine ACL/RLS du projet ne crée qu'UNE organisation (`20000000-…-0001`) et trois membres (owner, editor, cashier). Son bloc `set local role authenticated` (l.891-983) prouve donc la séparation des RÔLES à l'intérieur d'un tenant, jamais qu'un membre de l'org A voit zéro ligne de l'org B. Les tests par module (chasse, calendrier, pronostics, événement, modèles, solde) portent bien une seconde organisation ; les tables du SOCLE — campaigns, wheels, prizes, qr_codes, participations, spins, newsletter_subscribers, audit_logs — n'ont aucune assertion inter-tenant nulle part.

**Preuve.** supabase/tests/security_acl.test.sql:742-747 (fixture : un seul `insert into public.organizations`, une seule ligne) et 891-983 (le bloc `authenticated` ne change que `request.jwt.claim.sub` entre les trois rôles de la MÊME org). À comparer à supabase/tests/hunt_settlement_and_member_role.test.sql:53-56, qui crée « Org Voisine » explicitement pour cela.

**Impact.** Une régression sur `is_org_member`/`is_org_editor`, sur une policy du socle ou sur un grant de colonne d'`organizations` ne serait attrapée par aucune assertion : la suite resterait verte pendant que l'org A lirait les campagnes et les participations de l'org B. C'est le trou de couverture qui a précisément laissé passer SEC-1.

**Correction proposée** (coût M). Ajouter une « Org Voisine » et un membre propriétaire à elle dans la fixture, puis huit `results_eq('select count(*) from public.X', array[0::bigint])` joués depuis sa session sur les huit tables du socle — plus une sur `audit_logs`, qui rendra SEC-1 rouge.

#### `P3` SEC-4 — Filet de privilèges par défaut présent pour anon, absent pour authenticated

**Constat.** 00021 pose un `alter default privileges … revoke all on tables from anon` : toute table future est fermée à anon sans que l'auteur y pense. Il n'existe aucun équivalent pour `authenticated` (le dépôt l'a fait pour les FONCTIONS en 00017:8-9, jamais pour les tables). `stripe_events`, `rate_limits`, `admin_users`, `admin_sessions`, `admin_audit_logs`, `admin_notes` et `webhook_deliveries` ne portent NI `revoke … from authenticated`, NI grant explicite : leur fermeture repose uniquement sur « RLS active + zéro policy ». L'intention est écrite en commentaire et n'est vérifiée nulle part.

**Preuve.** supabase/migrations/00021_revoke_anon_table_access.sql:11-14 (le filet, anon seulement) vs supabase/migrations/00017_security_acl_rbac_integrity.sql:8-9 (le filet, fonctions seulement). Commentaire non tenu : supabase/migrations/00018_authenticated_table_grants.sql:32 « Les tables internes (stripe_events, rate_limits, admin_*) restent sans privilèges authenticated ». Contre-exemple de la bonne pratique : supabase/migrations/20260722100000_jobs_queue.sql:50. Avertissement sur la divergence des bootstraps : supabase/migrations/20260720200500_service_role_table_grants.sql:1-14.

**Impact.** Défense en profondeur absente sur les tables les plus sensibles (sessions admin, événements Stripe, seaux de rate-limit). Une seule policy permissive ajoutée un jour sur l'une d'elles rendrait les privilèges hérités immédiatement effectifs, sans qu'aucun grant n'apparaisse dans une migration. Le risque est amplifié par le fait, documenté dans le dépôt, que le bootstrap hébergé diffère du local : pgTAP peut être vert en CI sur des privilèges qui ne sont pas ceux de la production.

**Correction proposée** (coût S). Ajouter `alter default privileges for role postgres in schema public revoke all privileges on tables from authenticated;` (symétrique de 00021), plus un `revoke all on table public.<t> from authenticated` explicite pour les sept tables citées, et sept assertions `ok(not has_table_privilege('authenticated', …, 'SELECT'))` dans security_acl.test.sql — le fichier en compte déjà 45 du même genre.

#### `P3` SEC-5 — Neuf tables filles échappent à la clé étrangère composite qui fait voyager le tenant

**Constat.** Le schéma applique presque partout la doctrine « la clé étrangère porte l'organisation » — 21 tables portent `unique (id, organization_id)` et les filles référencent `(parent_id, organization_id)`. Neuf références y échappent et pointent le parent par son seul `id` : `event_sessions.current_question_id`, `calendar_openings.resulting_spin_id`, `quiz_rewards.resulting_spin_id`, `referral_signups.proof_spin_id`, `referral_rewards.resulting_spin_id`, `loyalty_rewards.resulting_spin_id`, `loyalty_order_codes.consumed_member_id`, `contest_leagues.created_by`, `email_log.participation_id`. Aucune n'est exploitable aujourd'hui : j'ai vérifié que `authenticated` n'a d'INSERT sur aucune de ces neuf tables (toutes les écritures passent par des RPC service_role).

**Preuve.** 20260727120000_events_live.sql:157 ; 20260728120000_calendar_campaigns.sql:235 ; 20260803120000_quizzes.sql:755 ; 20260729120000_referral.sql:207 et 248 ; 20260725120000_loyalty_passport.sql:194 ; 20260915120000_loyalty_order_codes.sql:71 ; 20260723100000_contest_leagues.sql:23 ; 20260723110000_merchant_automations.sql:351. Grants vérifiés : 20260727120000_events_live.sql:376-382 (event_sessions = select/delete seulement), 20260729120000_referral.sql:348-349, 20260915120000_loyalty_order_codes.sql:157-161, 20260723100000_contest_leagues.sql:48, 20260723110000_merchant_automations.sql:372.

**Impact.** Aucun impact aujourd'hui. Mais la garantie « une ligne ne peut pas pointer l'entité d'un autre tenant » n'est pas uniforme : le jour où l'une de ces tables gagne un `grant insert` — geste banal quand on branche un écran de réglage —, la policy `with check (is_org_editor(organization_id))` laissera passer une ligne estampillée de l'org A qui désigne une entité de l'org B, et rien en base ne l'arrêtera. Deux cas concernent des tables qui portent des codes de retrait (loyalty_rewards, quiz_rewards).

**Correction proposée** (coût M). Ajouter la contrainte composite là où le parent porte déjà `unique (id, organization_id)` (spins l'a via `spins_wheel_campaign_org_fk`, event_questions et loyalty_members l'ont). Pour les cas où le parent n'a pas la clé candidate, l'ajouter d'abord. Alternative moins coûteuse si la migration est jugée trop large : une assertion pgTAP qui énumère les FK simples vers une table tenant-scopée et les compare à une liste d'exceptions assumées.

### Surface publique, webhooks, jetons, anti-abus

*Couverture réelle* : Lu integralement : les 17 route.ts sous src/app/api (crons, health, page-opens, sms/webhook, wallet, newsletter/unsubscribe, pronos/tv), src/actions/skill.ts, src/lib/skill.ts, src/lib/validations/skill.ts, src/lib/turnstile.ts, src/lib/token-secrets.ts, src/lib/unsubscribe.ts, src/lib/anonymous-player.ts, src/lib/request-ip.ts, src/lib/rate-limit.ts, next.config.ts, src/proxy.ts, vercel.json, plus spinWheel dans src/actions/play.ts et les definitions SQL de check_rate_limit, increment_qr_scan, increment_module_page_open et de la generation des codes GAIN-. Verifie et ECARTE : signature Stripe (constructEvent + STRIPE_WEBHOOK_SECRET, double idempotence via stripe_events) ; injection PostgREST (les deux seuls .or() du depot, src/lib/module-grants-loader.ts:68 et :201, n interpolent qu un ISO serveur — aucun terme joueur) ; open redirect (safeNext, src/actions/auth.ts:28-30, restreint a ^/invite/...$) ; NEXT_PUBLIC_ (9 variables, toutes publiques par nature) ; fail-open du rate-limit (le defaut est documente et les chemins critiques passent failClosed) ; SSRF (aucune liste blanche d URL sortante pilotee par le joueur) ; les 13 jeux de revelation (l issue vient de perform_atomic_spin, le client ne declare rien). NON inspecte : je n ai lance ni test, ni build, ni supabase (consigne), donc rien n est confirme a l execution — notamment si Turnstile et Upstash sont reellement provisionnes en production, ce dont depend la portee de SEC-3. Je n ai pas lu de bout en bout quiz.ts, calendar.ts, events.ts, referral.ts, loyalty.ts et hunts.ts : j ai audite leurs points de composition de seau (tous cles sur des identifiants RESOLUS plus un hash de cookie, la discipline correcte) sans verifier chaque garde metier. Les policies RLS ne relevent pas de cet axe et n ont pas ete relues.

#### `P2` SEC-1 — Seau de debit de /api/page-opens cle sur un identifiant choisi par l'appelant

**Constat.** Les deux branches de la route composent leur seau avec l identifiant fourni dans la query string : rateLimitBucket("scan", slug, ip) et rateLimitBucket("scan", moduleKey, publicId, ip). slug et publicId ne sont valides que par une forme (SLUG_RE) et ne sont JAMAIS resolus avant la consommation du seau. Chaque valeur inventee ouvre donc un seau NEUF de 60 req/60 s. Le depot connait pourtant ce defaut et l a corrige ailleurs : beginProgressionPlayer consomme d abord progressionDevice, un plafond cle sur une valeur que le client ne choisit pas, precisement parce que organizationId venait du client. Ici il n existe aucun plafond equivalent, et la route n exige meme pas de cookie.

**Preuve.** src/app/api/page-opens/route.ts:59-65 et :80-86 (seaux) ; correctif du meme defaut : src/actions/meta-progression.ts:1020-1052 et RATE_LIMITS.progressionDevice, src/lib/rate-limit.ts:487-505

**Impact.** Un client non authentifie, sans cookie, obtient un debit non borne sur deux RPC service_role. increment_module_page_open (supabase/migrations/20260912120000) enchaine jusqu a huit resolutions de table par appel, dont un j.id::text = p_public_id qui interdit l usage d index. Chaque requete ecrit en plus une ligne dans public.rate_limits ; prune_rate_limits ne passant qu une fois par jour (cron purge-data), les lignes d une rafale s accumulent jusqu a 24 h. C est le chemin le moins cher du produit pour faire travailler la base de production.

**Correction proposée** (coût S). Consommer d abord un seau que l appelant ne peut pas choisir — l IP seule (rateLimitBucket("scan:ip", ip), failClosed) — AVANT le seau par ressource, exactement comme progressionDevice precede progressionPlayer. Le seau par slug reste utile pour l attribution, il ne peut simplement plus etre le seul.

#### `P2` SEC-2 — Reflexe et Jauge acceptent un succes declare par le navigateur (Codex C3)

**Constat.** evaluateSkill retourne pour reflex et gauge `succeeded: attempt.succeeded === true` — le verdict est litteralement le booleen envoye par le client, valide par un simple z.coerce.boolean(). La seule contre-mesure est isSkillAttemptTimingPlausible, qui compare l ecoule depuis payload.iat a un plancher : 1400 ms pour reflex, et pour gauge (max(0, 50 - tolerancePct)/100) * 1400 - 100. Comme gaugeConfigSchema plafonne tolerancePct a 50, une jauge reglee au maximum a un plancher de 0 ms. Un script qui appelle startSkillChallenge, attend 1,5 s, puis poste {gameType:"reflex", succeeded:true} reussit 100 % du temps. Les 4 autres defis (rps, puzzle, mystery_word, estimate) sont bien evalues serveur, et les 13 jeux de REVELATION ne sont pas concernes : spinWheel refuse tout game_type de defi et l issue vient entierement de perform_atomic_spin.

**Preuve.** src/lib/skill.ts:138-145 (evaluateSkill), :170-189 (minimumSkillSuccessElapsedMs), :191-210 (isSkillAttemptTimingPlausible), :46-50 (constantes) ; src/lib/validations/skill.ts:249-254 et gaugeConfigSchema (tolerancePct max 50) ; garde des jeux de revelation : src/actions/play.ts:152

**Impact.** Aucun gain forge : perform_atomic_spin applique play_limit AVANT la branche et l issue reste bornee par les poids et le stock. Mais le reglage de difficulte du commercant devient inerte. Un commercant qui regle une fenetre de reflexe a 200 ms attend un taux de reussite de l ordre de 10 % et dimensionne son stock dessus ; l attaquant convertit chacune de ses participations autorisees en tirage a pleine cote au lieu d une perte forcee. La sortie de lots par joueur est multipliee par l inverse du taux de reussite attendu.

**Correction proposée** (coût M). Deux options, dans l ordre de cout. (a) Ne pas associer reflex et gauge a un lot de valeur : les basculer en jeux de revelation cote produit, ce que le code documente deja comme leur nature reelle. (b) Rendre le geste verifiable : faire signer par start un instant-cible derive du seed serveur (comme deriveRpsServerMove le fait pour rps) et exiger que le client renvoie l horodatage de son clic dans une fenetre etroite autour de cette cible, plutot qu un booleen. A minima, refuser un succes gauge quand le plancher calcule vaut 0.

#### `P3` SEC-3 — /api/health : etat de la protection anti-bot publie, deux allers-retours base, aucun plafond

**Constat.** La route est publique, exclue du matcher du proxy, et n appelle rateLimit nulle part. Chaque GET declenche deux requetes Supabase avec la cle de service (une lecture REST sur organizations, un POST RPC ops_workers_health). Sa reponse contient securityConfiguration.error, qui vaut la chaine litterale « Protection anti-bot incomplete » quand Turnstile n est pas provisionne, ou « ADMIN_HOSTS manquant ».

**Preuve.** src/app/api/health/route.ts:53, :90, :131-152 (aucun appel a rateLimit dans le fichier) ; exclusion du proxy : src/proxy.ts:189

**Impact.** Deux effets distincts. (1) Amplification : un endpoint non authentifie et non borne qui fait deux requetes base par appel est le meilleur levier de charge du produit. (2) Oracle de posture : Turnstile est la SEULE barriere anti-automatisation reelle du parcours /play — les seaux par IP y sont volontairement fail-open et purement observationnels (ADR-032), et le cookie joueur est renouvelable a volonte. Annoncer publiquement quand cette barriere est tombee dit a un attaquant exactement quand lancer une campagne de bots.

**Correction proposée** (coût S). Borner la route (seau par IP, fail-open, calibre pour les moniteurs d uptime) et reduire le corps public a status + version + timestamp. Le detail des checks — et surtout securityConfiguration — derriere le meme CRON_SECRET que les workers, ou sur un chemin non devinable.

#### `P3` SEC-4 — Mode TV des pronostics : seau sur slug non resolu et fail-open

**Constat.** Meme defaut de composition que SEC-1 — rateLimitBucket("prono:tv", slug, ip) avec un slug brut, non resolu, valide par une seule regexp de forme : un seau neuf par slug invente. S y ajoute que rateLimit est appele SANS failClosed, donc une panne du backend de comptage laisse tout passer. loadContestTvContext, execute juste apres, fait des lectures service_role.

**Preuve.** src/app/api/pronos/[slug]/tv/route.ts:32-51 (SLUG_RE, seau, absence de failClosed)

**Impact.** Un balayage de slugs non authentifie n est borne par rien et alimente des lectures service_role a chaque coup. La reponse ne distingue pas inexistant d interdit (choix correct, deja documente), donc pas d oracle d enumeration — le cout est en charge base, pas en fuite.

**Correction proposée** (coût S). Comme SEC-1 : un seau par IP seule consomme en premier. Le choix fail-open est defendable pour un ecran de salle (ADR-032) et peut rester, une fois que le plafond non contournable existe au-dessus.

#### `P3` SEC-5 — Pass Apple Wallet : lecture service_role sans plafond de debit — **INCERTAIN**

**Constat.** GET /api/wallet/apple/[code] est non authentifie et n appelle rateLimit nulle part — c est la seule route publique du depot dans ce cas avec /api/health. Chaque appel fait une lecture service_role sur participations, jointe a prizes et organizations. La route distingue un gain vivant (200 + .pkpass, qui contient le code de retrait, le libelle du lot et le nom du commerce) d un gain mort ou inconnu (404). normalizeRedeemCode n impose pas la forme du code : il prefixe « GAIN- » a n importe quoi jusqu a 80 caracteres, donc toute saisie atteint la base.

**Preuve.** src/app/api/wallet/apple/[code]/route.ts:19-58 (aucun rateLimit) ; src/lib/utils.ts:100-106 (normalizeRedeemCode) ; generation du code : supabase/migrations/20260723110000_merchant_automations.sql:111-116 (8 caracteres, alphabet reduit)

**Impact.** L entropie du code (8 caracteres sur un alphabet reduit, ~2^40) rend la force brute impraticable : le risque n est pas le vol de gain, c est la lecture jointe non bornee sur la table qui porte les codes encaissables. Le depot a par ailleurs entoure /portefeuille d en-tetes Cache-Control tres soigneux pour exactement cette table (next.config.ts:70-75) ; la route qui sert le meme contenu en fichier n a, elle, aucune borne.

**Correction proposée** (coût S). Poser un seau failClosed sur l IP avant la requete, et valider la forme du code (^GAIN-[alphabet]{8}$) avant de toucher la base plutot qu apres — un code malforme ne doit pas atteindre participations.

**Contre-expertise.** Je ne peux pas lire les variables de production (lecture seule, pas d'acces Vercel) : d'ou INCERTAIN et non REFUTE. Mais rien dans le depot n'indique que ces cinq certificats soient provisionnes, et la doc les decrit comme un geste exploitant non fait ; si c'est le cas la route rend 404 avant toute requete base et le constat est vide. Deux elements affaiblissent l'impact meme dans le cas contraire : (1) participations.redeem_code est `text unique` (supabase/migrations/00001_initial_schema.sql:106) — une sonde d'index, pas un balayage ; (2) l'exclusivite annoncee (« la seule route publique du depot dans ce cas avec /api/health ») est fausse : src/app/api/newsletter/unsubscribe/route.ts:7-24 est publique, appelle createAdminClient et n'a aucun seau non plus. P2 -> P3.

#### `P3` SEC-6 — Les dix routes cron comparent CRON_SECRET avec !==

**Constat.** Chacune des dix routes sous src/app/api/cron/ tranche avec `request.headers.get("authorization") !== `Bearer ${secret}``, une comparaison de chaines JavaScript qui court-circuite au premier octet different. Le webhook SMS, dans le meme dossier api, fait exactement l inverse et explique pourquoi : comparaison de longueur puis timingSafeEqual. La discipline existe donc dans le depot, elle n a simplement pas ete appliquee aux crons. Aucune des dix routes ne porte non plus d anti-rejeu : un en-tete capture rejoue indefiniment.

**Preuve.** src/app/api/cron/jobs/route.ts:65 ; src/app/api/cron/expire-trials/route.ts:95-96 ; src/app/api/cron/jackpot-draws/route.ts:43-44 ; src/app/api/cron/purge-data/route.ts:61-62 (meme forme dans les six autres) ; contre-exemple correct : src/app/api/sms/webhook/route.ts:200-211

**Impact.** Exploitabilite reelle faible : extraire un secret par mesure de temps a travers TLS, un CDN et une invocation serverless froide demande un rapport signal/bruit qu on n obtient pas en pratique. Ce que je rapporte est l ecart de discipline sur des routes qui declenchent des purges RGPD, des tirages de jackpot et des envois — pas une voie d attaque demontree. Le rejeu est sans consequence connue, les workers etant idempotents.

**Correction proposée** (coût S). Extraire l unique helper deja ecrit dans sms/webhook (longueurs comparees puis timingSafeEqual) dans src/lib/, et le faire appeler par les dix routes. Dix sites, meme geste, decision deja tranchee — c est le profil exact d un fan-out.

### Performance des données

*Couverture réelle* : Inspecté en lecture seule : les 127 migrations (recensement des 171 `create index` + croisement statique des 118 FK déclarées contre les index de tête), les RPC `event_public_state`, `org_qr_hub`, `org_customer_profiles_page`, le chemin complet du mode événement live (src/components/event/*, src/components/event/use-event-poll.ts, src/lib/event-realtime-contract.ts, src/lib/event-realtime.ts, src/actions/events.ts, src/lib/event-context.ts), les 33 `page.tsx` du dashboard (comptage des `await` puis lecture des 12 plus chargées), les 10 crons, les 2 routes d'export CSV, src/lib/rate-limit.ts, src/lib/weekly-digest.ts, src/lib/contest-sync.ts, docs/perf-report.md §7 et scripts/capacity-bench.mjs. Un balayage heuristique (script node) a listé 19 candidats « requête dans une boucle », tous ouverts et triés manuellement (13 faux positifs). NON inspecté / NON mesuré : aucune commande n'a été exécutée contre une base (ni EXPLAIN, ni pgTAP, ni bench) — tous les chiffres ci-dessous sont soit lus dans le code, soit repris de docs/perf-report.md, soit arithmétiques ; je n'ai pas pu vérifier les variables d'environnement réellement posées en production (Vercel), ni la valeur effective de `PGRST_DB_MAX_ROWS` sur le projet hébergé, ni les plans d'exécution réels.

#### `P1` EVT-1 — Jauge 1 000 non tenable, et Realtime ne suffit pas

**Constat.** Realtime n'est qu'un drapeau optionnel (`eventRealtimeEnabled()` exige `EVENTS_REALTIME_ENABLED=1`), absent de la production ET absent de `.env.example`. Sans lui, `eventPollDelay` rend 2 500 ms en `question_active`/`question_locked` : 1 000 joueurs = 400 req/s soutenues sur `getEventState`, contre ~150 req/s estimés disponibles. Le calcul de Codex tient exactement. Nuance importante : la moitié « lobby » du problème A ÉTÉ corrigée depuis (`eventLobbyDelay` borne le lobby à 50 req/s quelle que soit la jauge). Ce qui reste non résolu, et que le rapport ne dit pas : même Realtime activé, le plafond de connexions simultanées (200 Free / 500 Pro, chiffres du rapport) laisse les joueurs non abonnés sur le repli à 2 500 ms — `use-event-poll.ts:170-174` ne bascule sur 30 000 ms que si `status === "SUBSCRIBED"`. Sur Pro, 500 connectés à 30 s + 500 en repli à 2,5 s ≈ 217 req/s, toujours au-dessus des ~150 disponibles.

**Preuve.** src/lib/event-realtime-contract.ts:82-83 (2 500 ms) et :40-61 (budget lobby) ; src/lib/event-realtime.ts:18-21 (drapeau) ; src/components/event/use-event-poll.ts:168-175 (repli si non SUBSCRIBED) ; docs/perf-report.md:311-345 et :400-412 ; scripts/capacity-bench.mjs:270-279

**Impact.** L'offre « La Totale » vend 1 000 participants simultanés. Une soirée réelle à cette jauge fait s'effondrer la latence (p50 mesuré jusqu'à 10 s dans le rapport) sur l'écran le plus visible du produit — devant une salle. Poser la variable d'environnement, geste souvent présenté comme le correctif, ne ramène le besoin qu'à ~217 req/s : la promesse commerciale reste non tenue.

**Correction proposée** (coût M). Trois gestes, dans cet ordre : (1) poser `EVENTS_REALTIME_ENABLED=1` et l'ajouter à `.env.example` — gain immédiat pour les salles ≤ 500 ; (2) plafonner la jauge vendable à 500 tant qu'un banc n'a pas prouvé le contraire (`src/lib/plans.ts` porte déjà la règle) ; (3) le vrai levier, déjà nommé dans le rapport et jamais fait : cache serveur d'1 s par session sur la part PARTAGÉE de `event_public_state` (voir EVT-3).

#### `P2` EVT-2 — Trois allers-retours distants par poll d'événement, dont deux hors lecture métier

**Constat.** `getEventState` enchaîne trois appels distants STRICTEMENT SÉQUENTIELS : (1) `loadEventActionContext` — un select sur `event_sessions` joint à `organizations` ; (2) `observeEventPressure` → `rateLimit` → RPC `check_rate_limit` (ou REST Upstash), qui est une ÉCRITURE ; (3) la RPC métier `event_public_state`. Le compteur de pression est de l'observabilité pure — son verdict est délibérément ignoré, il ne refuse jamais — mais il est `await`é dans le chemin critique, entre la garde et la lecture.

**Preuve.** src/actions/events.ts:339-356 (les trois appels en séquence) ; src/lib/event-context.ts:349-357 ; src/lib/rate-limit.ts:538-557 (rateLimit = RPC check_rate_limit) et :581-594 (verdict ignoré) ; docs/perf-report.md:378-382 le nomme déjà comme coût dominant

**Impact.** Aux 400 req/s d'EVT-1, ce sont ~1 200 appels base par seconde, dont 400 écritures d'un compteur que personne ne lit pour décider. C'est la cause majoritaire du plafond de ~50-60 req/s mesuré même sur une salle QUASI VIDE — le rapport le constate sans en tirer la conséquence.

**Correction proposée** (coût M). Sortir l'observation de pression du chemin critique (`after()` de Next, comme le fait déjà `src/app/dashboard/pronostics/[id]/page.tsx:225`), ou l'échantillonner (1 poll sur 10). Puis fusionner la garde de contexte dans `event_public_state` : la RPC lit déjà `event_sessions`, elle peut rendre `unavailable` sur draft/archived elle-même. On passe de 3 allers-retours à 1.

#### `P2` LIST-1 — Listes de modules : parent paginé, table enfant chargée entière

**Constat.** Les pages quiz, fidélité, pronostics et chasses paginent bien leur liste (`.range()`), puis lancent en parallèle une seconde requête SANS limite ni filtre sur la page courante, pour compter en JavaScript. Les tables visées grossissent avec les JOUEURS, pas avec les modules : `contest_players`, `hunt_players`, `loyalty_members`. La pagination du parent n'y change rien.

**Preuve.** src/app/dashboard/quiz/page.tsx:71-75 (tous les `quiz_questions` de l'org) ; src/app/dashboard/loyalty/page.tsx:66-74 (tous les `loyalty_milestones` + tous les `loyalty_members`) ; src/app/dashboard/pronostics/page.tsx:68-71 (tous les `contest_players`) ; src/app/dashboard/hunts/page.tsx:62-71 (tous les `hunt_steps` + tous les `hunt_players`) ; comptage JS en src/app/dashboard/hunts/page.tsx:78-84

**Impact.** Double peine. Coût : un commerçant à 20 000 inscrits en pronostics transfère 20 000 lignes à chaque affichage de la liste. Correction : PostgREST plafonne les réponses (`max_rows = 1000` dans supabase/config.toml:8) — au-delà, le compte affiché est SILENCIEUSEMENT FAUX et plafonné, sans erreur ni indice à l'écran. Le geste posé pour la performance a introduit un compteur qui ment.

**Correction proposée** (coût M). Remplacer chaque requête « tout l'enfant » par un comptage groupé borné aux identifiants de la page : soit `.in("parent_id", idsDeLaPage)` puis agrégation JS (le volume redevient borné par 20 lignes de parents), soit une petite RPC `select parent_id, count(*) … where parent_id = any($1) group by 1`. La page `events` montre déjà une forme acceptable (comptes bornés à la page, src/app/dashboard/events/page.tsx:70-93).

#### `P2` IDX-1 — spins sans index sur campaign_id ni prize_id

**Constat.** `public.spins` (une ligne par lancer de roue) ne porte que trois index : `(wheel_id, player_key, created_at desc)`, `(organization_id)` et l'unique partiel `(wheel_id, player_key, play_window_key)`. Ni `campaign_id` ni `prize_id` n'en ont, alors que les deux sont des FK `on delete cascade` / `on delete set null`. La page de détail d'une campagne fait pourtant un `count exact` filtré sur `campaign_id` seul.

**Preuve.** supabase/migrations/00002_spins.sql:8-22 (table + les 3 seuls index) ; supabase/migrations/00019_atomic_security_sessions_timezone.sql:150-152 ; src/app/dashboard/campaigns/[id]/page.tsx:94-98 (`.eq("campaign_id", id).eq("source", "share")`, count exact head) ; vérifié par `git grep "create index" | grep spins` → 3 résultats

**Impact.** Trois conséquences mesurables quand la table grossit : (1) l'ouverture de la page d'une campagne devient un balayage complet de `spins` ; (2) supprimer une campagne balaie `spins` en entier pour honorer le CASCADE, dans la transaction du commerçant ; (3) même symptôme sur `participations.prize_id` (aucun index, `on delete set null`) — supprimer un lot balaie toutes les participations. Aujourd'hui invisible : une seule organisation de test.

**Correction proposée** (coût S). `create index concurrently spins_campaign_idx on public.spins (campaign_id);` et `participations_prize_idx on public.participations (prize_id);`. Pour le compteur de partages, un index partiel `(campaign_id) where source = 'share'` est encore plus étroit. Le recensement statique a sorti 38 FK sans index de tête — la plupart couvertes par une PK ou une contrainte unique composite, mais `contest_awards.contest_id` et `contest_final_standings.*` méritent le même passage.

#### `P2` EXP-1 — Export CSV clients : jusqu'à 100 agrégations complètes en séquence, sans budget de temps

**Constat.** `collecterProfilsExport` boucle sur `org_customer_profiles_page` par pages de 100 jusqu'à 10 000 lignes, SÉQUENTIELLEMENT. Or chaque appel de cette RPC refait un `group by p.email` sur TOUTES les participations de l'organisation, plus un `count(*) over ()` sur l'ensemble filtré, plus un OFFSET qui grandit. La borne posée sur le nombre de pages (documentée comme un correctif) ne supprime pas ce coût : elle le multiplie seulement par moins de pages. La route n'exporte aucun `maxDuration`.

**Preuve.** src/app/dashboard/customers/filters.ts:106-122 (boucle) et :78-80 (EXPORT_PAGE_SIZE 100 / EXPORT_MAX_ROWS 10 000) ; src/app/dashboard/customers/export/route.ts:46-62 (aucun maxDuration dans le fichier) ; supabase/migrations/20260923120000_filtres_hub_et_clients.sql:825-905 (le `group by` complet + `count(*) over ()` dans la RPC)

**Impact.** Un commerçant à 10 000 clients déclenche 100 agrégations complètes de sa table de participations dans une seule requête HTTP. Au budget par défaut d'une fonction Vercel, l'export part en timeout — et l'écran ne rend alors ni fichier ni message utile. Le commerçant conclut que l'export est cassé.

**Correction proposée** (coût M). Une RPC d'export dédiée qui fait UN SEUL `group by` et rend le flux complet borné à 10 000 lignes (mêmes filtres, mêmes colonnes, sans `count(*) over ()` ni OFFSET). À défaut : matérialiser l'agrégat une fois dans une CTE/table temporaire et paginer dedans. Poser aussi un `maxDuration` explicite sur la route.

#### `P2` DOC-1 — perf-report documente un cache d'état partagé inexistant

**Constat.** Le rapport décrit un découpage `event_etat_partage` / `event_etat_joueur` attribué à la « migration `20260919120000` », avec équivalence « prouvée » et un A/B chiffré (+17 %). Ces deux fonctions n'existent dans AUCUN fichier du dépôt (ni migration, ni src, ni test), et `20260919120000` est en réalité `partage_apres_jeu.sql` — le partage social après une partie, un tout autre chantier. Le même document se contredit soixante lignes plus loin : « Un cache serveur d'une seconde par session… Ce n'est pas fait ».

**Preuve.** docs/perf-report.md:361-375 (la section et le numéro de migration) vs docs/perf-report.md:416-421 (« Ce n'est pas fait ») ; `git grep -rn "etat_partage\|etat_joueur" .` ne rend QUE ces deux lignes de doc ; `ls supabase/migrations | grep 20260919` → `20260919120000_partage_apres_jeu.sql`

**Impact.** C'est le document qui « fait foi pour toute décision de capacité sur une animation live » (ses propres mots, ligne 428). Un lecteur y comprend que l'optimisation est livrée et que le levier restant est ailleurs — alors que le levier le moins cher, celui qui ramènerait 400 req/s à 1 req/s, n'a jamais été posé. C'est précisément l'erreur que la mémoire projet appelle « lire l'archive plutôt que le catalogue vivant ».

**Correction proposée** (coût S). Retitrer la section en « prototype mesuré, NON FUSIONNÉ », retirer le numéro de migration qui appartient à un autre chantier, et déplacer le résultat A/B en annexe de décision. Puis ouvrir le chantier pour de bon : c'est le correctif d'EVT-1 et d'EVT-2 à la fois.

#### `P3` CRON-1 — Rapport hebdomadaire : N+1 séquentiel sur 200 organisations sous 60 s

**Constat.** `runWeeklyDigest` parcourt jusqu'à 200 organisations une par une. Pour chacune : une RPC `org_weekly_digest`, un select des membres, PUIS un `auth.admin.getUserById` PAR destinataire (jusqu'à 3, en boucle `for` avec `await` à l'intérieur), puis un upsert de réservation. Rien n'est parallélisé, ni entre organisations ni entre destinataires. Le pire cas est ~1 000 allers-retours strictement sérialisés dans une fonction dont `maxDuration = 60`.

**Preuve.** src/lib/weekly-digest.ts:259-262 (le N+1 sur getUserById) ; :327-374 (la boucle séquentielle par organisation) ; :81 (MAX_RECIPIENTS_PER_ORG = 3) et :90 (MAX_ORGS = 200) ; src/app/api/cron/weekly-digest/route.ts:30 (maxDuration = 60)

**Impact.** À 40 ms l'aller-retour, le budget de 60 s est épuisé bien avant la 200e organisation. Le cron est coupé en vol : les organisations de fin de liste ne reçoivent jamais leur rapport, et le compteur `deferred` ne le dit pas (il ne compte que le reliquat du `limit`, pas les organisations perdues au timeout). Une panne silencieuse, sur une fonctionnalité dont l'absence ne produit aucune erreur visible — ce que le fichier reconnaît lui-même en commentaire.

**Correction proposée** (coût M). Deux gestes indépendants : (1) résoudre les e-mails en UNE requête par organisation (`admin.auth.admin.listUsers` filtré, ou mieux, une RPC qui joint `organization_members` à `auth.users` côté base) ; (2) traiter les organisations par lots concurrents (`Promise.allSettled` sur des tranches de 10), le travail étant indépendant d'une organisation à l'autre. Et faire compter au heartbeat les organisations non traitées, pas seulement le reliquat du `limit`.

#### `P2` HUB-1 — org_qr_hub matérialise les huit modules avant de paginer

**Constat.** La RPC construit un `union all` de huit sous-requêtes couvrant TOUTES les lignes de chaque module de l'organisation — dont deux `left join lateral` qui agrègent `event_sessions` par jeu et `hunt_steps` par chasse — puis filtre, puis calcule `count(*) over ()`, puis applique `limit`/`offset`. Le coût est celui de l'ensemble complet, quelle que soit la page demandée. Même forme dans `org_customer_profiles_page`, qui regroupe toutes les participations avant de rendre 50 lignes.

**Preuve.** supabase/migrations/20260923120000_filtres_hub_et_clients.sql:676-745 (union all + lateraux + `count(*) over ()` + limit/offset) ; même motif :824-905 pour org_customer_profiles_page

**Impact.** Aujourd'hui borné par le nombre de modules d'une organisation (petit) — donc sans douleur. Mais `org_customer_profiles_page` est bâtie sur `participations`, qui elle grossit sans limite : la page Clients paie une agrégation complète à chaque affichage et à chaque changement de tri, et c'est ce qui rend EXP-1 coûteux.

**Correction proposée** (coût L). Pour le hub, laisser tel quel : le volume ne le justifie pas. Pour les profils clients, matérialiser l'agrégat par e-mail (vue matérialisée rafraîchie par trigger sur `participations`, ou colonnes dénormalisées maintenues à l'écriture) — c'est ce qui rend d'un coup la page ET l'export bon marché.

#### `P3` CNT-1 — Compte exact sur participations et paramètre page sans borne haute

**Constat.** La page Participations demande `count: "exact"` sur `participations` filtrées à chaque rendu, et le paramètre `page` n'est borné que par le bas (`Math.max(1, …)`). `?page=1000000` produit un OFFSET de 50 millions. Même absence de borne haute dans `litFiltresModule` pour les sept listes de modules, et dans `org_customer_profiles_page` dont la garde ne teste que `v_offset < 0`.

**Preuve.** src/app/dashboard/participations/page.tsx:84 (parse de page), :107 (count exact), :111 (range) ; src/components/dashboard/module-list-filters.tsx:64-65 ; supabase/migrations/20260923120000_filtres_hub_et_clients.sql:797-801 (garde de pagination sans plafond d'offset)

**Impact.** Le compte exact est un balayage d'index de toutes les lignes de l'organisation à chaque page vue — payé pour afficher un total dont l'exactitude n'a aucune conséquence métier. L'OFFSET non borné est un coût que n'importe quel propriétaire authentifié déclenche en modifiant l'URL ; ce n'est pas une faille, c'est une facture. Bien noter que `litFiltresModule` a DÉJÀ le bon réflexe pour le « page suivante » (une ligne de plus, pas de count) — l'incohérence est entre deux écrans du même dashboard.

**Correction proposée** (coût S). Remplacer le `count: "exact"` par `count: "estimated"` (ou par le motif « une ligne de plus » déjà retenu ailleurs), et plafonner `page` à `ceil(total/pageSize)` côté parse — un `Math.min` à côté du `Math.max` existant.

#### `P3` JKP-1 — Le jackpot rafraîchit toute la page serveur toutes les 20 s

**Constat.** `jackpot-tracker.tsx` appelle `router.refresh()` toutes les 20 secondes. Sur une page `force-dynamic`, cela re-exécute tout le rendu serveur de `/jackpot/[id]` — résolution de campagne, contrôle de droit du module, état du tirage, joueur — et renvoie une charge RSC complète, alors que la seule donnée qui bouge est un compteur partagé. Le calendrier fait le geste plus finement (60 s, et un appel ciblé `getCalendarState`), l'événement live aussi (server action ciblée).

**Preuve.** src/components/jackpot/jackpot-tracker.tsx:51 (POLL_MS = 20 000) et :230-237 (router.refresh) ; src/app/jackpot/[id]/page.tsx:20 (force-dynamic) ; src/lib/jackpot-context.ts:295-310 (3 allers-retours par rendu) ; à comparer à src/components/calendar/calendar-tracker.tsx:169-181

**Impact.** Chaque joueur présent sur la page produit environ 3 requêtes base toutes les 20 s, soit 9 req/s pour 60 joueurs simultanés — pour une valeur qui tiendrait dans une réponse de quelques octets. Le jackpot collectif est précisément le module conçu pour rassembler du monde au même moment.

**Correction proposée** (coût S). Remplacer `router.refresh()` par une server action ciblée qui ne rend que la jauge (le même motif que `getCalendarState`), et aligner la cadence sur les 60 s du calendrier tant qu'aucune mesure ne justifie 20.

### Poids client et rendu

*Couverture réelle* : Inspecte en lecture seule : next.config.ts, package.json, src/app/layout.tsx, le graphe d'import complet des 182 fichiers « use client » (script de trace ecrit dans le scratchpad, pour remonter les chaines client → zod et client → node:crypto en excluant les frontieres \"use server\"/server-only), src/components/ui/fond-ecran.tsx + src/lib/fonds-ecran.ts, src/actions/branding.ts, les pages des 10 surfaces joueur, et surtout le build de production DEJA COMMITE dans .next/ : tailles brutes et gzip de chaque chunk, les 96 page_client-reference-manifest.js, et les balises <script> des pages prerendues. Aucun build, test, serveur ni Playwright lance. Deux limites : ce build date du 2026-08-09 (BUILD_ID ixDuBWMQllbCIYSe1kn78, V1.56) alors que HEAD est 69774c8 du 2026-08-16, donc les noms de chunks peuvent avoir bouge ; et je n'ai aucune mesure de terrain (LCP, CLS, TBT reels) — uniquement des poids statiques et le graphe de modules. Trois pistes de la mission ont ete VERIFIEES PUIS ECARTEES : three.js est bien charge en dynamique (src/components/marketing/lumoz-guide.tsx:156, `await import(\"./lumoz-model\")`), les deux polices Geist sont reellement utilisees y compris cote joueur (font-mono porte les codes de lot dans 12 composants joueur), et le chunk de polyfills legacy de 112 Ko porte bien l'attribut noModule.

#### `P1` PERF-1 — posthog-js dans le bundle initial de toutes les pages

**Constat.** `src/components/analytics.tsx:4` fait un `import posthog from "posthog-js"` statique, et `<Analytics />` est monte dans le layout racine (`src/app/layout.tsx:37`). Le module est donc telecharge et evalue sur chaque route — y compris /privacy, /terms, /cookies, /portefeuille et les surfaces joueur — meme si NEXT_PUBLIC_POSTHOG_KEY est absent ou si le joueur a refuse les traceurs : seul `posthog.init()` est conditionne, pas le chargement.

**Preuve.** src/components/analytics.tsx:4 et src/app/layout.tsx:3+37. Mesure sur le build .next commite (BUILD_ID ixDuBWMQllbCIYSe1kn78) : .next/static/chunks/1ybvpeiszj1j6.js = 231 656 o bruts / 75 052 o gzip, seul chunk contenant "posthog", present en <script> dans .next/server/app/index.html et .next/server/app/cookies.html, et reference par 114 fichiers de .next/server. Les pages /privacy et /terms portent 284 Ko bruts de chunks de composants client, dont 226 Ko pour ce seul chunk (80 %).

**Impact.** Sur le chemin le plus chaud du produit — un scan de QR sur un telephone en 4G dans un commerce — 73 Ko gzip de JS a parser et executer avant toute interactivite, pour une mesure d'audience que le joueur n'a pas encore acceptee. Sur des pages purement textuelles (/cookies, /terms) c'est 80 % du poids client.

**Correction proposée** (coût M). Rendre l'import paresseux : dans `applyConsent`, remplacer l'import statique par `const posthog = (await import("posthog-js")).default` a l'interieur de la branche « consentement accorde ET cle presente ». Faire de meme dans `capturePlayEvent` (garder la meme signature pour les 8 appelants de src/components/wheel/*), qui devient un no-op tant que le module n'est pas charge.

#### `P1` PERF-3 — zod embarqué dans toutes les surfaces joueur

**Constat.** `src/lib/wheel-style.ts:11` importe zod et expose `resolveWheelStyle`, appele DANS le navigateur par `wheel-svg.tsx:168` et `game-shell.tsx:79` pour re-valider un style que le serveur a deja lu et valide. Second canal, gratuit celui-la : `claim-form.tsx:7` n'importe qu'un libelle (`smsConsentLabel`) de `src/lib/validations/sms.ts`, ce qui suffit a tirer zod.

**Preuve.** src/lib/wheel-style.ts:11, src/components/wheel/wheel-svg.tsx:12+168, src/components/wheel/game-shell.tsx:22+79, src/components/wheel/claim-form.tsx:7. Trace du graphe d'import : 28 composants client de surfaces joueur atteignent zod. Chunk .next/static/chunks/2-3f1p4geboky.js = 283 469 o bruts / 63 Ko gzip, present dans les manifests de /play, /quiz, /calendar, /passeport, /poster et 8 routes dashboard. JS initial mesure de /play (rootMainFiles + chunks de la page) : 1 438 Ko bruts / 409 Ko gzip, dont posthog + zod = 503 Ko bruts / 136 Ko gzip, soit 33 % du gzip.

**Impact.** Un tiers du JS gzip que telecharge un joueur apres avoir scanne un QR sert a de l'analytics non consentie et a un validateur de schema. Sur mobile, ce sont les octets qui retardent le premier tour de roue.

**Correction proposée** (coût M). Appeler `resolveWheelStyle` cote serveur dans les pages joueur et passer le `WheelStyle` deja resolu en prop (les composants prennent deja `WheelStyle` en type) ; le type-only import ne coute rien. Deplacer `smsConsentLabel` hors de `validations/sms.ts` vers un module de libelles sans zod. Critere de sortie : le chunk 2-3f1p4geboky disparait du manifest de /play, /quiz et /calendar.

#### `P2` PERF-2 — 405 Ko de polyfills crypto-browserify via node:crypto dans deux composants client

**Constat.** Deux composants client importent, sans passer par une frontiere serveur, un module qui importe `node:crypto`. Turbopack injecte alors toute la pile crypto-browserify (elliptic secp256k1, AES, DES, pbkdf2, events, Buffer) dans le bundle navigateur. `quiz-editor.tsx:44` n'importe pourtant qu'une constante de libelle (`QUIZ_DELETE_LOSS_HINT`), et `progression-season-card.tsx:63` que des helpers purs.

**Preuve.** Chaines tracees : src/components/dashboard/quiz-editor.tsx:44 → src/lib/validations/quiz.ts:8 → src/lib/pronostics.ts:7 (`import { createHash, randomBytes } from "node:crypto"`) ; src/components/dashboard/progression-season-card.tsx:63 → src/lib/meta-progression.ts:26 (`import { createHash } from "node:crypto"`). Chunk .next/static/chunks/2ma1r5wrg7i64.js = 414 814 o bruts / 121 Ko gzip (contient "secp256k1", "des-ede3-cbc", "Montgomery curve", EventEmitter) ; il est reference par exactement deux page_client-reference-manifest.js : dashboard/quiz/[id] et dashboard/progression — les deux routes de ces deux chaines, et aucune autre.

**Impact.** /dashboard/quiz/[id] est la page la plus lourde du produit : 1 104 Ko bruts / 318 Ko gzip de chunks de composants client, dont 37 % pour ce seul polyfill dont aucune ligne ne sert dans le navigateur. L'editeur de quiz est l'ecran ou le commercant passe le plus de temps.

**Correction proposée** (coût M). Sortir les valeurs pures de leurs modules serveur : deplacer `QUIZ_DELETE_LOSS_HINT` (et ce que quiz-editor lit vraiment de validations/quiz) et les helpers lus par progression-season-card dans un module sans dependance a node:crypto — ou isoler dans pronostics.ts / meta-progression.ts la partie crypto dans un fichier separe importe seulement par le serveur. Verifier ensuite que le chunk 2ma1r5* disparait des deux manifests.

#### `P2` PERF-4 — 9 surfaces joueur force-dynamic sans loading.tsx ni Suspense

**Constat.** Seule /play combine ISR (`revalidate = 30`) et un squelette `loading.tsx`. Les neuf autres surfaces publiques (quiz, calendar, hunt, event, jackpot, pronos, passeport, portefeuille, commande) sont en `force-dynamic` sans aucune frontiere Suspense : rien ne peut etre envoye au navigateur avant que toutes les requetes de la page aient rendu.

**Preuve.** src/app/quiz/[slug]/page.tsx:25 (`export const dynamic = "force-dynamic"`) et l'equivalent dans les 8 autres ; `find src/app -name loading.tsx` ne rend que 3 fichiers (admin/(protected), dashboard, play/[slug]) ; `Suspense` n'apparait qu'une fois dans tout src/ (src/app/dashboard/loading.tsx). src/app/play/[slug]/loading.tsx montre le motif deja adopte dans le depot.

**Impact.** Apres un scan de QR vers un quiz, un calendrier ou une chasse, le joueur regarde la page blanche du navigateur pendant toute la duree du rendu serveur (plusieurs requetes Supabase, cold start Vercel possible). C'est l'ecart de perception le plus visible entre /play et les quatorze autres modules.

**Correction proposée** (coût S). Ajouter un `loading.tsx` par segment joueur, calque sur src/app/play/[slug]/loading.tsx et habille aux couleurs du module : la coquille (html/body/layout) est alors envoyee immediatement et le joueur voit un etat de chargement au lieu du vide.

#### `P3` PERF-5 — Logo commerçant : variante unique jusqu'à 1600 px servie en vignette de 56 px

**Constat.** `uploadLogo` normalise en WebP mais ne redimensionne qu'a 1600x1600 maximum et n'accepte le resultat que sous 2 Mo — une seule variante est stockee. Cette URL est ensuite posee dans des `<img>` affiches a 56 ou 64 px sur toutes les surfaces joueur, sans srcset ni vignette. Sur /play l'image n'a meme pas d'attributs width/height (seulement `h-16 max-w-40`).

**Preuve.** src/actions/branding.ts:65 (`.resize({ width: 1600, height: 1600, fit: "inside" })`) et :12 (MAX_LOGO_BYTES = 2 Mo) ; consommateurs : src/components/wheel/game-idle-screen.tsx:124-128 (sans dimensions), src/components/quiz/quiz-experience.tsx:684 (56 px), src/components/loyalty/loyalty-passport.tsx:327, src/components/jackpot/jackpot-tracker.tsx:273, src/components/hunts/hunt-journey.tsx:120, src/app/pronos/[slug]/page.tsx:260 (64 px). A comparer a scripts/optimiser-fonds.mjs, qui produit lui 4 variantes par illustration.

**Impact.** Un commercant qui televerse une photo detaillee fait telecharger jusqu'a ~2 Mo a chaque joueur pour un rond de 56 px, dans l'en-tete, donc en concurrence directe avec le rendu du jeu. Le depot a la doctrine (« on optimise hors requete ») et l'outil (sharp) : la seule image qui varie par tenant est justement celle qui y echappe.

**Correction proposée** (coût M). Dans branding.ts, produire deux sorties comme le fait optimiser-fonds.mjs : l'originale bornee et une vignette ~256 px, et servir la vignette dans les `<img>` de 56-64 px. A minima, abaisser le `resize` a la plus grande taille reellement affichee. Ajouter width/height sur game-idle-screen.tsx:124.

#### `P3` PERF-7 — Fonds d'écran : aucune largeur sous 960 px

**Constat.** Le srcset des fonds ne propose que 960, 1280 et 1672 px, avec `sizes="100vw"` pour le variant page. Un telephone a DPR 2-3 resout donc systematiquement vers 960 ou 1280 px, soit 137 a 487 Ko pour une image purement decorative (aria-hidden, pointer-events-none). La vignette 360 px existe mais est volontairement exclue du srcset.

**Preuve.** src/lib/fonds-ecran.ts:83 (`LARGEURS_RENDU = [960, 1280, 1672]`) et :95 ; src/components/ui/fond-ecran.tsx:83 (`page: "100vw"`) et :113-124. Poids mesures : public/fonds/prairie-960.webp 137 836 o, noel-960.webp 218 246 o, noel-1280.webp 337 702 o, noel-1672.webp 486 854 o. Total public/fonds = 8 919 280 o sur 40 fichiers (public/ entier = 9,4 Mo).

**Impact.** Le `fetchPriority="low"` empeche le fond de voler la priorite au LCP, mais pas de consommer la bande passante d'un mobile en commerce, en concurrence avec le JS du jeu. Une largeur ~640 px diviserait ce poids par environ deux sur les telephones les plus courants.

**Correction proposée** (coût M). Ajouter une largeur 640 px a scripts/optimiser-fonds.mjs et a LARGEURS_RENDU (10 fichiers supplementaires, ~700 Ko au depot), le navigateur ne telechargeant toujours qu'une variante. Alternativement, restreindre `sizes` du variant page pour empecher la selection du 1672.

#### `P3` PERF-8 — Un aller-retour DB de trop, en série, sur /quiz et /calendar

**Constat.** Sur /quiz et /calendar, deux requetes qui ne dependent pas l'une de l'autre sont attendues successivement : le classement puis les bundles de roue pour le quiz, la resolution des cases puis les bundles pour le calendrier. Elles ne dependent toutes deux que du contexte deja charge.

**Preuve.** src/app/quiz/[slug]/page.tsx:71 (`await getQuizLeaderboard`) puis :80 (`await loadCalendarSpinBundles`) ; src/app/calendar/[slug]/page.tsx:70 (`await admin.from("calendar_days")`) puis :87 (`await loadCalendarSpinBundles`). A comparer a src/lib/play-context.ts:186, qui a justement ete refondu en un seul aller-retour pour cette raison, et a src/app/dashboard/page.tsx:85 qui utilise Promise.all.

**Impact.** Une latence Supabase de plus par scan, sur des pages qui sont deja force-dynamic et sans squelette (voir PERF-4) : elle s'ajoute directement au temps d'ecran blanc.

**Correction proposée** (coût S). Grouper les deux appels en `Promise.all` dans chacune des deux pages — ils partagent le meme contexte et n'ont aucune dependance mutuelle.

#### `P3` PERF-6 — Image de défi « juste nombre » : URL externe non bornée sans place réservée — **RÉFUTÉ**

**Constat.** Le defi d'estimation affiche une image dont l'URL vient du commercant, hors de tout pipeline d'optimisation, sans attribut width/height ni ratio d'aspect : la boite fait 0 px de haut avant chargement puis saute jusqu'a 192 px, poussant le formulaire vers le bas au moment ou le joueur s'appreterait a repondre.

**Preuve.** src/components/wheel/games/estimate-challenge.tsx:64-72 — `<img src={challenge.imageUrl} className="mx-auto mb-6 max-h-48 w-full max-w-[320px] rounded-2xl border-2 object-cover">`, aucun width/height, aucun `aspect-`, aucun `loading`/`decoding`. Le commentaire de la ligne 64 assume explicitement « URL externe du commercant, hors pipeline next/image ».

**Impact.** Decalage de mise en page (CLS) sur l'ecran de reponse d'un jeu chronometre, et poids d'image totalement libre — rien ne borne ce que le commercant pointe. C'est le seul endroit du parcours joueur ou les deux defauts se cumulent.

**Correction proposée** (coût S). Reserver la boite (`aspect-[4/3]` ou width/height explicites correspondant a max-h-48 / max-w-[320px]) et ajouter `decoding="async"`. Si l'URL reste libre, la faire transiter par le meme traitement sharp que les logos a l'enregistrement du defi plutot que de la servir brute.

**Contre-expertise.** REFUTÉ sur son titre et sur son impact principal. « Poids d'image totalement libre — rien ne borne ce que le commerçant pointe » est la phrase que la CSP contredit directement : sur les hôtes tiers, rien ne se charge. Le constat s'est arrêté au commentaire de la ligne 64 (« URL externe du commerçant, hors pipeline next/image ») et l'a lu comme un aveu de risque, sans vérifier si une couche en aval fermait la porte — elle est fermée. CE QUI SURVIT, et que je consigne pour ne pas le perdre : l'absence de width/height produit bien un CLS pour les images effectivement chargeables (hébergées sur Supabase Storage ou en propre), sur l'écran de réponse d'un jeu chronométré. C'est réel, c'est un attribut à ajouter, c'est P3. Note secondaire à part : si un commerçant colle une URL tierce, l'image ne s'affichera jamais alors que le formulaire l'a acceptée — c'est un défaut fonctionnel silencieux, hors de cet axe, à verser à qui audite la validation.

### Crons, workers, idempotence

*Couverture réelle* : Inspecté ligne à ligne : les 10 routes `src/app/api/cron/**/route.ts`, `vercel.json`, `src/app/api/health/route.ts`, `.github/workflows/production-health.yml`, et les modules de traitement `src/lib/jobs.ts`, `worker-health.ts`, `webhook-worker.ts`, `webhooks.ts`, `webhook-url.ts`, `newsletter-worker.ts`, `sms-dispatch.ts`, `automations.ts`, `sms-window.ts`, `date-time.ts`, `monitoring.ts`, plus les migrations `20260722100000` (claim_jobs / requeue_stale_jobs), `00019` (claim_webhook_deliveries), `20260805240000`, `20260819120000`, `20260820120000`, `20260821120000`. Pour C4, remonté le chemin complet `startSkillChallenge` → `submitSkillChallenge` → `perform_atomic_spin` → `recoverPendingWin` et la garde `reprise-gain.test.ts`. NON inspecté, faute d'exécution autorisée ou d'accès : l'état RÉEL en production (valeurs de `ops_worker_definitions.enabled`, présence des secrets Vault, existence d'un moniteur d'uptime externe ou de règles d'alerte Sentry — d'où la confiance « moyenne » sur JOB-5) ; les corps SQL des douze RPC de purge et de `perform_atomic_spin`, lus seulement par leurs signatures et commentaires ; aucun test, build, Playwright ni supabase n'a été lancé, conformément à la consigne. Deux constats Codex hors de mon axe (C1 capacité live, C2 gardes de publication) n'ont pas été touchés ; C3 relève de la sécurité applicative, pas des traitements de fond.

#### `P2` JOB-1 — Le drain des webhooks n'a aucun budget temps et peut dépasser maxDuration

**Constat.** `drainWebhookDeliveries` réclame jusqu'à 50 livraisons (src/lib/webhook-worker.ts:35) et les POSTe EN SÉRIE, sans le moindre contrôle d'horloge dans la boucle (src/lib/webhook-worker.ts:56-111), avec 5 s de timeout par livraison (src/lib/webhooks.ts:11, appliqué par request.setTimeout dans src/lib/webhook-url.ts:155). Les deux appelants déclarent `maxDuration = 60` (src/app/api/cron/jobs/route.ts:55 et :166-168 ; src/app/api/cron/webhooks/route.ts:32 et :49). Douze endpoints qui pendent suffisent donc à épuiser le budget de la fonction — et le worker `jobs` ne lance le drain qu'APRÈS avoir déjà consommé jusqu'à 45 s de traitement métier.

**Preuve.** src/lib/webhook-worker.ts:35 (limit = 50), :56-111 (boucle sans Date.now) ; src/lib/webhooks.ts:11 ; src/app/api/cron/jobs/route.ts:55,166-168 ; src/app/api/cron/webhooks/route.ts:32,49

**Impact.** Trois effets en cascade, tous portés par UN seul commerçant dont l'URL webhook pend. (1) La fonction est tuée : `finishWorkerRun` (src/app/api/cron/jobs/route.ts:181) n'est jamais atteint, le heartbeat reste `running`, `ops_workers_health` déclare `jobs` non sain et /api/health rend 503 pour toute la plateforme. (2) Les livraisons déjà POSTées mais dont le `delivered_at` n'a pas été écrit redeviennent réclamables au bout de `locked_until` = 2 min (00019_atomic_security_sessions_timezone.sql:403) : le commerçant reçoit des DOUBLONS. (3) Le drain repart de zéro à chaque passage et n'avance jamais.

**Correction proposée** (coût S). Passer un budget temps résiduel à `drainWebhookDeliveries` et le tester à chaque itération de la boucle (sortir en laissant le reste à `queued`), et abaisser le lot par défaut de 50 à une valeur compatible avec 5 s × N < budget (≈8). Idéalement, sortir les livraisons du chemin critique du worker `jobs` : ce sont elles qui font tomber le heartbeat qui garde le healthcheck public.

#### `P2` JOB-2 — Newsletter : email_log écrit une seule fois pour 1000 destinataires

**Constat.** `processNewsletterJob` envoie l'intégralité des destinataires via `sendNewsletterEmails`, qui boucle en interne sur des lots de 100 (src/lib/resend.ts:625-658), PUIS écrit `email_log` une seule fois pour tout le run (src/lib/newsletter-worker.ts:171-195). Le commentaire de ce même bloc affirme « si le processus meurt entre l'envoi et l'écriture, le pire est de renvoyer à ce seul lot » (src/lib/newsletter-worker.ts:164-167) : c'est faux, « ce seul lot » vaut jusqu'à MAX_RECIPIENTS = 1000 (src/lib/newsletter-worker.ts:17), soit dix appels Resend séquentiels sous un `maxDuration = 60`.

**Preuve.** src/lib/newsletter-worker.ts:17, :134-142, :164-195 ; src/lib/resend.ts:625-658 ; src/app/api/cron/jobs/route.ts:55

**Impact.** Une coupure de la fonction au 8e lot laisse 800 emails partis et ZÉRO ligne dans `email_log`. `requeue_stale_jobs` relance le job (chemin nominal, cf. src/lib/newsletter-worker.ts:34-40), la reprise ne trouve aucun servi et réexpédie l'intégralité : jusqu'à 1000 doublons chez les abonnés d'un commerçant, sur un canal marketing où le doublon coûte des désinscriptions.

**Correction proposée** (coût S). Déplacer l'écriture d'`email_log` DANS la boucle de lots : soit en faisant boucler `processNewsletterJob` sur des tranches de 100 (appel `sendNewsletterEmails` par tranche + upsert immédiat), soit en donnant à `sendNewsletterEmails` un callback `onBatchDelivered` invoqué après chaque `resend.batch.send` accepté. La contrainte d'unicité sur `dedup_key` rend l'écriture par lot déjà idempotente.

#### `P2` JOB-3 — Newsletter tronquée à 1000 abonnés en silence, rapportée « completed »

**Constat.** L'action plafonne la cible sans le dire : `targetCount = Math.min(nb_abonnés, 1000)` puis écrit ce nombre dans `recipient_count` (src/actions/newsletter.ts:22,80-83,94). Le worker applique le même plafond par `.slice(0, MAX_RECIPIENTS)` (src/lib/newsletter-worker.ts:74-76). Aucun des deux ne compare le total réel au plafond, aucun message, aucun compteur, aucun `deferred` — contrairement aux crons `reengage` et `automations` qui, eux, publient explicitement leur reliquat.

**Preuve.** src/actions/newsletter.ts:22,80-83,94 ; src/lib/newsletter-worker.ts:17,74-76,197-209

**Impact.** Un commerçant à 2500 abonnés voit « campagne envoyée, 1000 destinataires, completed » ; 1500 clients n'ont jamais rien reçu et rien ne le dira jamais. Une relance ne les rattrape pas non plus : les 1000 premiers étant journalisés, la reprise conclut `toutDejaServi` → `completed` (src/lib/newsletter-worker.ts:114-132).

**Correction proposée** (coût M). Demander le total réel (`count: "exact"`) comme le fait `/api/cron/reengage` (src/app/api/cron/reengage/route.ts:143-152), le stocker dans `recipient_count`, et soit refuser l'envoi au-delà du plafond avec un message explicite, soit déposer un job de suite avec curseur. Au minimum : afficher « 1000 sur 2500 ciblés » plutôt que « 1000 ».

#### `P2` JOB-4 — expire-trials et weekly-digest enregistrés mais jamais supervisés

**Constat.** Les deux workers sont insérés dans `ops_worker_definitions` avec `enabled = false` (20260819120000_register_expire_trials_worker.sql:54-58 ; 20260821120000_weekly_digest.sql:286-290). La seule règle qui bascule `enabled` est un UPDATE conditionnel joué UNE FOIS, et positionné AVANT ces deux migrations (20260820120000_supervise_workers_with_proven_heartbeat.sql:61-69). L'en-tête de la migration weekly-digest l'écrit noir sur blanc (« ne le rallumera PAS toute seule »), mais aucune migration ni script ultérieur ne rejoue la règle — vérifié par grep sur `supabase/migrations` et `scripts/`.

**Preuve.** supabase/migrations/20260819120000_register_expire_trials_worker.sql:54-58 ; supabase/migrations/20260821120000_weekly_digest.sql:273-290 ; supabase/migrations/20260820120000_supervise_workers_with_proven_heartbeat.sql:61-69

**Impact.** `ops_workers_health()` ne rend que les workers `enabled` : la résiliation des essais et le rapport hebdomadaire peuvent s'arrêter totalement sans qu'aucun écran, aucun objectif de service et aucun healthcheck ne change de couleur. Ce sont précisément les deux workers dont le silence est le plus discret — personne ne « constate » qu'un rapport du lundi n'est pas arrivé, ni qu'un essai reste `trialing`.

**Correction proposée** (coût S). Un UPDATE d'exploitation en production (`update ops_worker_definitions set enabled = true where worker in ('expire-trials','weekly-digest') and exists(... succeeded ...)`), ou une migration rejouant la règle générale de 20260820120000. Corriger au passage la période de `jackpot-draws`, inscrite à 86400 s alors que pg_cron le déclenche toutes les 5 min (docs/observability.md:164-170) : le superviser en l'état laisserait 30 h de tolérance à un worker de tirage mort.

#### `P3` JOB-5 — Aucune sonde de santé planifiée — **INCERTAIN**

**Constat.** Le seul appelant automatisé de `/api/health` est le workflow `production-health.yml`, déclenché uniquement sur `deployment_status` (.github/workflows/production-health.yml:3-4,11-15). Aucun `schedule:` dans les quatre workflows du dépôt. Et `/api/health` n'exige la santé que de `jobs` et `sync-contests` (src/app/api/health/route.ts:110-120) : les huit autres workers, dont `purge-data` (RGPD) et `jackpot-draws`, n'y entrent pas.

**Preuve.** .github/workflows/production-health.yml:3-4,11-15 ; src/app/api/health/route.ts:110-120 ; docs/observability.md:139-142 (« Brancher dessus un moniteur d'uptime » — geste décrit, non fait dans le dépôt)

**Impact.** Entre deux déploiements, aucune vérification n'a lieu. Une purge RGPD qui échoue chaque nuit, un tirage de jackpot arrêté ou une file de jobs bloquée restent invisibles jusqu'au prochain `git push` ou jusqu'à ce qu'un humain ouvre /admin/monitoring. Les statuts `degraded` n'émettent en outre aucun événement Sentry : un rapport hebdomadaire non envoyé pour cause de reliquat ne remonte que dans un compteur (src/app/api/cron/weekly-digest/route.ts:59-77).

**Correction proposée** (coût S). Ajouter un `schedule:` (toutes les 15-30 min) au workflow `production-health.yml`, ou brancher un moniteur externe sur /api/health avec alerte sur code ≠ 200. Et faire remonter un `reportSecurityEvent`/`reportError` sur toute clôture de heartbeat en `failed`, pour que Sentry porte le signal indépendamment de l'écran.

**Contre-expertise.** Tous les faits INTERNES au dépôt sont vérifiés. Mais le constat, tel qu'il est titré, affirme un état de PRODUCTION que le dépôt ne peut pas prouver : docs/observability.md:139-141 décrit précisément le branchement d'un moniteur d'uptime externe (UptimeRobot/BetterStack) comme un geste d'exploitation hors dépôt. L'absence d'un `schedule:` en CI ne démontre pas l'absence de surveillance — elle démontre que le dépôt n'en porte pas la preuve. Je le laisse INCERTAIN par défaut de preuve, et j'abaisse P2→P3 : c'est une question de configuration d'exploitation à poser au propriétaire, pas un défaut de code corrigible ici.

#### `P3` JOB-6 — expire-trials : 200 appels Stripe séquentiels sans budget temps

**Constat.** Le lot vaut 200 organisations (src/app/api/cron/expire-trials/route.ts:86) et la boucle appelle `hasLiveStripeSubscription` une fois par organisation, en série, sans aucun contrôle d'horloge (src/app/api/cron/expire-trials/route.ts:142-176) — alors que la route déclare `maxDuration = 60` (:79). À 250-300 ms par aller-retour Stripe, 200 organisations consomment déjà le budget entier avant la moindre écriture.

**Preuve.** src/app/api/cron/expire-trials/route.ts:79,86,142-176

**Impact.** Sur un parc qui grossit, la fonction est tuée en plein lot : le heartbeat reste `running` jusqu'à ce que `purge_ops_worker_runs` le referme, les compteurs publiés sont perdus, et le passage se solde en silence par un travail partiel qu'aucun `degraded` ne signale. Le rattrapage progresse quand même (tri par `trial_ends_at` croissant), donc la perte n'est pas définitive — c'est la VISIBILITÉ de la troncature qui manque, comme pour JOB-3.

**Correction proposée** (coût S). Reprendre le motif déjà en place dans `/api/cron/jobs` et `/api/cron/sync-contests` : un `startedAt` et un `TIME_BUDGET_MS` testés en tête de chaque itération, le reste compté en `deferred` et le passage clos en `degraded` avec un code `organizations_deferred` — exactement ce que font `reengage` (:184-204) et `automations`.

#### `P3` JOB-7 — Toute la file de jobs s'arrête si le journal de santé est indisponible

**Constat.** `/api/cron/jobs` utilise la variante STRICTE `startWorkerRun` et rend 500 sans rien traiter si l'insertion du heartbeat échoue (src/app/api/cron/jobs/route.ts:76-84). Les huit crons quotidiens font l'inverse et le justifient explicitement : `startWorkerRunSafely` existe précisément pour qu'« une table absente ou une base momentanément indisponible ne suspende ni une purge RGPD ni un tirage » (src/lib/worker-health.ts:90-110). L'asymétrie n'est motivée nulle part sur la route `jobs`.

**Preuve.** src/app/api/cron/jobs/route.ts:76-84 ; src/lib/worker-health.ts:72-110

**Impact.** Une panne d'OBSERVABILITÉ (RLS, clé étrangère `ops_worker_definitions` non satisfaite, table indisponible) suspend le chemin MÉTIER le plus chargé de la plateforme : codes de retrait par SMS, newsletters, relances, automatisations et webhooks sortants. Le journal de santé devient une dépendance dure de la production, alors que le reste du système est construit sur le principe inverse.

**Correction proposée** (coût S). Soit passer `jobs` en `startWorkerRunSafely` et accepter un passage sans journal (le travail reste protégé par `claim_jobs`, idempotent et verrouillé), soit écrire sur la route l'argument qui justifie de préférer l'arrêt au travail non journalisé — pour que le prochain lecteur ne le retourne pas au hasard.

#### `P3` JOB-8 — submitSkillChallenge n'est pas idempotent (nonce signé jamais consommé)

**Constat.** C4 est largement INFIRMÉ : `recoverPendingWin` relit un gain non réclamé de moins de 30 min (src/actions/play.ts:88-113) et les quatre shells joueur l'appellent au montage, sous garde mécanique d'ordonnancement (src/components/wheel/reprise-gain.test.ts:40-45,69-119) ; loyalty, calendar et quiz reprennent par `resulting_spin_id` / `already_consumed` (src/actions/loyalty.ts:1748-1754 ; src/actions/calendar.ts:427,478 ; src/actions/quiz.ts:642,693). CE QUI RESTE VRAI : le jeton de défi porte un `nonce` (src/actions/skill.ts:147,155) qui n'est ni stocké ni consommé — aucune table, aucune migration ne le référence. Un rejeu du même jeton dans sa fenêtre de validité rappelle donc `perform_atomic_spin` (src/actions/skill.ts:311-319).

**Preuve.** src/actions/skill.ts:147,155,311-319 (nonce signé, jamais consommé) ; src/actions/play.ts:88-113 ; src/components/wheel/reprise-gain.test.ts:40-45

**Impact.** Coupure réseau au moment du submit, puis nouvelle tentative du joueur : sur une campagne à `play_limit` borné, le second appel rend `blocked` et `recoverPendingWin` restitue le gain — perte nulle. Sur une campagne SANS limite, un second tour est consommé pour une partie déjà jouée. Une issue PERDANTE, elle, n'est jamais reprise (`recoverPendingWin` filtre `is_losing = false`) : le joueur ne saura pas que son tour est parti. Ni double gain, ni double code : la perte est bornée à un tour.

**Correction proposée** (coût M). Consommer le nonce : une table `skill_challenge_nonces (nonce pk, expires_at)` avec insertion sous unicité AVANT `perform_atomic_spin` — un rejeu se heurte au 23505 et relit l'issue au lieu de la refaire. Alternative moins coûteuse : passer le nonce en clé d'idempotence à la RPC. Non prioritaire tant que `play_limit` reste borné par défaut.

#### `P3` JOB-9 — webhook-worker : trois écritures dont l'erreur n'est jamais lue

**Constat.** Après une livraison réussie, l'`update({ delivered_at })` n'est pas contrôlé (src/lib/webhook-worker.ts:82-90) ; idem pour la branche d'échec (:95-107), pour la fermeture « webhook disabled » (:63-71) et pour la purge des accusés de plus de 30 jours (:114-118). Aucun `error` n'est capturé, aucun `reportError`.

**Preuve.** src/lib/webhook-worker.ts:63-71,82-90,95-107,114-118

**Impact.** Si l'écriture de `delivered_at` échoue alors que le POST distant a réussi, la livraison redevient réclamable après `locked_until` et repart : le commerçant reçoit un doublon, et le compteur `delivered` du heartbeat le déclare pourtant livré. La panne de la ligne est totalement muette — c'est la classe de défaut que le reste du projet ferme systématiquement (cf. `settleJob`, src/lib/jobs.ts:143,160,176, qui lève sur chacune de ses trois écritures).

**Correction proposée** (coût S). Lire le `error` des quatre appels et le remonter par `reportError("webhooks.settle", …)` ; compter les clôtures refusées dans le `WebhookDrainSummary` pour que le heartbeat les publie, comme `writeFailed` dans expire-trials (src/app/api/cron/expire-trials/route.ts:246-249).

### États de chargement, erreurs, formulaires

*Couverture réelle* : Inspecté en lecture seule : recensement exhaustif des 71 `page.tsx` de `src/app` avec remontée d'arbre vers le `error.tsx`/`loading.tsx` le plus proche (script node dans le scratchpad) ; `global-error.tsx`, les 3 `error.tsx`, les 3 `loading.tsx`, `not-found.tsx` ; les hooks `use-action-form.ts`, `use-auto-save.ts`, `use-auto-save-manuel.ts` et leur garde mécanique `use-action-form-coverage.test.ts` ; les 4 écrans « tour offert » (calendar/quiz/loyalty/referral), `game-shell.tsx`, `play-experience.tsx`, `scratch-experience.tsx`, `skill-game-shell.tsx`, `hunt-journey.tsx`, `quiz-experience.tsx`, `experience-blueprint-gallery.tsx`, `toast-enregistrement.tsx`, `ui/button.tsx`, les formulaires d'auth. Scans mécaniques : 158 `type="submit"` (14 sans `disabled` dans leur balise, tous vérifiés à la main — 12 sont des formulaires GET de filtre ou une déconnexion, sans risque de doublon), 21 `await action(` hors `try` dans les composants joueur (relus un par un, 16 étaient en réalité enveloppés par une fonction englobante). Ce que je n'ai PAS pu faire : aucune exécution (ni Vitest, ni Playwright, ni build, ni serveur) — les modes de défaillance réseau sont donc établis par lecture du chemin de code, jamais reproduits ; et je n'ai pas ouvert les ~40 composants dashboard restants ligne à ligne, seulement ceux désignés par les scans.

#### `P1` UI-1 — Les quatre écrans « tour offert » gèlent définitivement sur une coupure réseau

**Constat.** `launch()` pose `busyRef.current = true` puis fait `const result = await consumeXSpin(...)` SANS `try/catch`. Un rejet de la promesse (réseau coupé pendant l'aller-retour, cas ordinaire d'un client dans un commerce) saute tout ce qui suit : `busyRef` reste à `true` pour toujours, aucun `setError`, aucun changement de phase. Les quatre fichiers ont la forme strictement identique et ne contiennent aucun `catch`.

**Preuve.** src/components/calendar/calendar-spin-experience.tsx:90-97 ; src/components/quiz/quiz-spin-experience.tsx:87-94 ; src/components/loyalty/loyalty-spin-experience.tsx:92-99 ; src/components/wheel/referral-spin-experience.tsx:90-97. Correctif de référence déjà en place sur le même patron : src/components/wheel/game-shell.tsx:158-170 (« requestingRef restait à true POUR TOUJOURS et le bouton devenait inerte »). Campagne d'origine consignée dans docs/bugs.md:426-432, qui couvre la roue, les 8 jeux de révélation et les 6 jeux de défi — pas ces quatre-là.

**Impact.** Le joueur a DÉJÀ gagné son tour (case de calendrier, quiz, passeport de fidélité, parrainage). Il appuie sur « Tourner », rien ne se passe, et le bouton reste cliquable mais inerte à chaque appui : ni message, ni sablier, ni sortie. Il repart sans son lot alors que le grant peut avoir été consommé côté serveur. C'est le pire endroit du produit pour un écran muet : le joueur vient de fournir l'effort que le module lui demandait.

**Correction proposée** (coût S). Envelopper l'appel comme dans `game-shell.tsx:162-169` : `try { result = await consumeXSpin(...) } catch { busyRef.current = false; setError("Connexion perdue. Vérifiez votre réseau et réessayez."); setPhase("error"); return; }`, aux quatre sites. Puis ajouter au test mécanique existant une garde qui refuse un `busyRef.current = true` suivi d'un `await` non enveloppé, pour que la cinquième copie ne réintroduise pas le défaut.

#### `P2` UI-2 — Reprise d'un lot en attente avalée en silence, et écran de blocage sans aucune sortie

**Constat.** Les quatre coques de jeu font `prepareAnonymousPlayer().then(() => recoverPendingWin(slug)).catch(() => undefined)`. Si cet appel échoue, `pendingWinRef.current` reste `null` ; quand le joueur appuie ensuite, le serveur refuse le tirage PARCE QUE le lot existe déjà, et la branche de repli (`if (pending)` → afficher le gain) ne se déclenche pas : on tombe sur `setPhase("blocked")`. L'écran « blocked » ne rend ni `LienPortefeuille` ni aucun autre chemin.

**Preuve.** src/components/wheel/game-shell.tsx:126-135 (catch) puis :173-184 (repli `pendingWinRef`) et :276-288 (écran blocked, aucun lien) ; mêmes catch en src/components/wheel/play-experience.tsx:172, src/components/wheel/scratch-experience.tsx:102, src/components/wheel/skill-game-shell.tsx:143. La garde src/lib/portefeuille-atteignable.test.ts impose ce lien sur les huit écrans de GAIN — l'écran de blocage n'est pas dans sa population.

**Impact.** Le joueur a un lot décrémenté du stock, avec son `claimToken` en base, et lit « 🔒 Impossible de jouer ». Aucun bouton, aucun lien, pas même vers `/portefeuille` qui est justement l'endroit conçu pour retrouver ce lot. Côté commerçant, le stock est consommé pour un lot que personne ne viendra retirer. Le commentaire du code (game-shell.tsx:119-122) annonce précisément la protection que ce `catch` désarme.

**Correction proposée** (coût S). Deux gestes indépendants : (a) remplacer `.catch(() => undefined)` par un catch qui pose un drapeau `repriseIndisponible` et retente une fois ; (b) rendre `<LienPortefeuille />` dans la phase `blocked` des quatre coques et étendre la population de `portefeuille-atteignable.test.ts` aux écrans de blocage — c'est le seul écran où le joueur est coincé, donc celui qui a le plus besoin de la sortie.

#### `P2` UI-3 — 28 des 71 routes n'ont NI frontière d'erreur NI frontière de chargement

**Constat.** Recensement complet par remontée d'arbre : 43 routes sont couvertes par les 3 seuls `error.tsx`/`loading.tsx` du dépôt (dashboard 33, admin 9, play 1). Les 28 autres n'ont aucune frontière, dont 15 des 16 surfaces joueur publiques. Le patron a été posé une fois, sur `play/[slug]` — le socle V1 — et n'a suivi aucun des quinze modules livrés depuis.

**Preuve.** Seuls fichiers existants : src/app/dashboard/{error,loading}.tsx, src/app/admin/(protected)/{error,loading}.tsx, src/app/play/[slug]/{error,loading}.tsx. Sans frontière : calendar/[slug], commande/[token], event/[code], event/[code]/screen, hunt/[token], jackpot/[id], newsletter/unsubscribe, passeport/[programId], portefeuille, poster/[id], poster/[id]/qr-test, pronos/[slug], pronos/[slug]/recover, pronos/[slug]/tv, quiz/[slug] (+ les 5 routes (auth), admin/login, admin/unauthorized, onboarding, / et les 4 pages légales).

**Impact.** Une exception dans le rendu serveur remonte jusqu'à src/app/global-error.tsx:19-36, qui REMPLACE le layout racine : le joueur perd la police, la DA Kermesse et le logo du commerçant, et lit un « Une erreur est survenue » gris générique. Le contraste est mesurable avec src/app/play/[slug]/error.tsx:6, qui dit ce qui compte (« Si un gain venait d'être tiré, il sera retrouvé automatiquement ») et offre `reset()`. Le risque n'est pas théorique : src/app/quiz/[slug]/page.tsx:71 et :77 attendent `getQuizLeaderboard` et `loadCalendarSpinBundles` APRÈS le `notFound()`, donc hors de toute garde.

**Correction proposée** (coût M). Un `error.tsx` + `loading.tsx` partagés au niveau d'un groupe de routes joueur (ex. `src/app/(player)/`) plutôt que quinze copies — même DA que `play/[slug]`, avec `reset()` et le lien `/portefeuille`. Puis un test mécanique dérivé du système de fichiers, sur le modèle de `portefeuille-atteignable.test.ts`, qui exige une frontière pour toute route publique nouvelle.

#### `P3` UI-4 — L'envoi du code de chasse par email peut emporter l'écran qui porte le code

**Constat.** `HuntClaimForm` est le seul composant joueur resté sur `useTransition`, et son `startTransition(async () => { await claimHuntReward(...) })` n'a pas de `try/catch`. Le rejet d'une action asynchrone dans une transition React 19 ne peut pas être rattrapé par le composant ; il remonte à la frontière d'erreur la plus proche — et `/hunt/[token]` n'en a aucune (voir UI-3), donc `global-error.tsx`.

**Preuve.** src/components/hunts/hunt-journey.tsx:427-441 (aucun try) ; le formulaire est rendu à src/components/hunts/hunt-journey.tsx:415 sous `{code && <HuntClaimForm …/>}`, donc dans la même page que le code de gain. Aucun error.tsx sous src/app/hunt/. Convention inverse partout ailleurs dans le produit : src/components/wheel/game-shell.tsx:162-169, src/components/dashboard/quiz-editor.tsx:621-625.

**Impact.** Le joueur vient de terminer la chasse et voit son code. Il tente l'envoi par email — une commodité OPTIONNELLE, le composant le dit lui-même — et une coupure réseau à cet instant efface toute la page au profit d'un écran gris générique, code compris. Si la propagation ne se produit pas, la variante est un `pending` bloqué à « Envoi… » pour toujours : dans les deux cas le joueur perd, sur un geste facultatif.

**Correction proposée** (coût S). Envelopper le corps de la transition dans un `try/catch` qui pose `setError("Envoi impossible, votre code reste affiché ci-dessus.")`. Ce message est le bon : il rappelle que l'échec ne coûte rien. Aligner au passage sur `useActionForm`, comme les 52 autres formulaires du dépôt.

#### `P3` UI-5 — Les 33 pages du dashboard partagent le squelette de la Vue d'ensemble

**Constat.** `src/app/dashboard/loading.tsx` est le seul `loading.tsx` de l'arbre dashboard : Next.js le sert pour les 33 routes du segment. Il dessine un titre, un sous-titre, cinq tuiles de statistiques en grille et une grande carte — la forme exacte de la seule page `/dashboard`.

**Preuve.** src/app/dashboard/loading.tsx:11-19 (grille de 5 tuiles + carte de 160px) ; aucun autre loading.tsx sous src/app/dashboard/ (recensement complet). Routes concernées : les 33 segments listés sous src/app/dashboard/, dont /customers, /participations, /qr-codes, /team, /settings/*, /redeem — toutes des listes ou des formulaires, aucune n'ayant de rangée de tuiles.

**Impact.** À chaque navigation d'onglet, le commerçant voit cinq tuiles vides apparaître puis disparaître au profit d'un tableau ou d'un formulaire. Le squelette promet une structure qui n'arrivera pas : décalage de mise en page systématique et signal trompeur, là où un squelette sert précisément à annoncer la forme du contenu. Sur /dashboard/redeem, écran de caisse utilisé devant un client, le clignotement se paie à chaque passage.

**Correction proposée** (coût S). Soit ramener ce squelette à une forme neutre (bandeau de titre + un bloc), soit poser un `loading.tsx` par famille : listes (`/customers`, `/participations`, `/qr-codes`), éditeurs (`/campaigns/[id]`, `/quiz/[id]`, …), caisse (`/redeem`). Trois fichiers suffisent à couvrir les 33 routes ; le squelette actuel reste alors sur `/dashboard` seul, où il est juste.

#### `P3` UI-6 — L'enregistrement automatique n'a aucun filet hors focusout : portée réelle mesurée

**Constat.** Portée réelle du défaut connu, mesurée : `useAutoSave` n'a que deux déclencheurs de vidage — le minuteur de 800 ms et `focusout` — et ANNULE son minuteur au démontage sans le vider (choix assumé, use-auto-save.ts:62-67 et :155-160). Il n'existe aucun écouteur `beforeunload` ni `visibilitychange` dans tout `src/`. La navigation par `<Link>` est bien couverte (le clic déplace le focus, donc `focusout` part) ; ne le sont pas le bouton « précédent » du navigateur, la fermeture d'onglet et la bascule d'application sur mobile.

**Preuve.** src/lib/use-auto-save.ts:110-161 (les deux seuls déclencheurs, `annuler()` en nettoyage) ; src/lib/use-auto-save-manuel.ts:186-202 (même choix, commenté). Aucun `beforeunload`/`visibilitychange` dans src/ (recherche sur tout l'arbre, zéro occurrence). Population exposée : 20 appels sur 12 fichiers d'édition — contest-settings.tsx (7 appels : :237, :326, :328, :532, :833, :1159, :1257), quiz-editor.tsx (:364, :1254), calendar-editor.tsx (:181, :637), loyalty-editor.tsx:694, hunt-editor.tsx:449, wheel-settings.tsx:161, wheel-style-editor.tsx:291, campaign-settings.tsx:134, campaign-automation.tsx:52, campaign-play-settings.tsx:40, jackpot-editor.tsx:89, event-editor.tsx:197, wheel-schedule-editor.tsx:48.

**Impact.** Le commerçant tape la dernière valeur d'un champ et bascule d'application ou revient en arrière dans la seconde : la modification est perdue, et le seul témoin — l'indicateur « en attente » — disparaît avec la page. Comme il n'y a plus de bouton « Enregistrer » sur ces écrans, il n'a aucun moyen de savoir que quelque chose n'est pas parti. Fenêtre étroite (800 ms) mais rejouée à chaque champ de douze éditeurs.

**Correction proposée** (coût S). Ajouter au hook un écouteur `visibilitychange` (état `hidden`) qui vide la file — c'est l'événement fiable sur mobile, contrairement à `beforeunload`. Le geste est le même que `surFocusOut` : `if (minuteur.current === null) return; soumettre();`. Une frappe part alors au passage en arrière-plan, ce qui couvre bascule d'application, verrouillage d'écran et fermeture d'onglet ; le retour arrière du navigateur reste hors d'atteinte et mérite d'être dit dans le commentaire plutôt que laissé implicite.

### Accessibilité et sémantique

*Couverture réelle* : Inspecté en lecture seule : `src/app/globals.css` (722 lignes, jetons `--color-k-*`, blocs `prefers-reduced-motion` et `print`), `e2e/axe.ts` et les 31 specs Playwright (relevé exhaustif des `goto` et des sites de scan), les 70 `page.tsx` de `src/app`, `src/components/wheel/` (roue, jeux de révélation, 6 jeux skill-gated, carte à gratter, claim-form), `src/components/quiz|calendar|jackpot|loyalty|pronos|event|ui|dashboard|admin`, les gardes existantes `src/lib/contrast.ts`, `contrast.test.ts`, `play-contrast.test.ts`, et `supabase/seed.sql` pour les styles de roue semés. Vérifié mécaniquement par script : présence d'`alt` sur tous les `<img>` (aucun manquant hors commentaires), absence de saut de niveau de titre intra-fichier (0 sur 140 fichiers à titres), absence de `onClick` sur `<div>`/`<span>`, absence de `tabIndex` positif, absence de `focus:outline-none` sans remplacement visible, tableaux sans conteneur de défilement (1 seul, côté admin). Ce que je n'ai PAS pu faire : aucune exécution (ni axe, ni Playwright, ni build — interdits par la consigne), donc tous les ratios de contraste sont calculés à la main depuis les jetons hexadécimaux du dépôt selon la formule WCAG 2.x, et les couples texte/fond sont déduits du contexte de classes, non mesurés dans un navigateur — un fond composité inattendu pourrait déplacer un chiffre à la marge, jamais d'un facteur deux. Je n'ai pas non plus pu évaluer l'ordre de tabulation réel ni la visibilité effective du focus au rendu ; le constat A11Y-5 repose sur la lecture du code de gestion du focus, pas sur une navigation clavier observée.

#### `P2` A11Y-3 — Le jeton orange DÉCORATIF sert de couleur de texte à ~2,5:1, y compris sur le compte à rebours du code de gain

**Constat.** `--color-k-orange` (#f5793b) est documenté dans globals.css comme décoratif — il tombe sous 3:1 — et une variante texte `--color-k-orange-text` (#b45309, 4,66:1) existe pour ce cas. Six sites l'ignorent : un lien de navigation du dashboard, et les cinq compteurs d'expiration du code de gain sur /play en thème kermesse. Mesuré : 2,53:1 sur crème (#fdf6e3), 2,73:1 sur blanc — seuil requis 4,5:1 à ces tailles (12-14 px).

**Preuve.** Jetons : src/app/globals.css:31 et :32-37. Sites : src/app/dashboard/campaigns/[id]/page.tsx:376 (`text-sm font-bold text-k-orange`) ; src/components/wheel/claim-form.tsx:588 (« Ce code disparaît dans N s ») ; play-experience.tsx:445 ; game-shell.tsx:282 ; scratch-experience.tsx:262 ; skill-game-shell.tsx:354. Correctif déjà appliqué ailleurs et commenté : src/components/dashboard/qr-code-card.tsx:14-20

**Impact.** Le texte le plus urgent de l'écran de gain — le délai avant disparition du code que le joueur doit montrer en caisse — est le moins lisible. Aucun de ces six sites n'est atteint par un scan axe : la page campagne n'est pas scannée, et les compteurs n'apparaissent que dans des états (code TTL, jeu bloqué) qu'aucune fixture E2E ne provoque.

**Correction proposée** (coût S). Remplacer `text-k-orange` par `text-k-orange-text` sur ces six sites. Ajouter au test de budget/contraste une garde interdisant `text-k-orange` hors `hover:` — le jeton reste légitime en survol et en décor.

#### `P2` A11Y-2 — Carte à gratter : le seul chemin clavier de la mécanique rend à ~1,1:1 sur les presets clairs

**Constat.** Le canvas de grattage est `aria-hidden` et ne répond qu'aux événements pointeur ; le bouton « Révéler directement » est donc l'unique accès clavier/lecteur d'écran au résultat. Il est écrit en `text-zinc-300` en dur, sans branche de thème, alors que `ScratchExperience` calcule pourtant `kermesse = playOnLightSurface(style)` et le passe partout ailleurs. Sur les presets clairs livrés (« Pastel » #fbcfe8→#fda4af, « Cartoon » #fef08a→#f59e0b), #d4d4d8 ressort à ~1,2:1.

**Preuve.** src/components/wheel/scratch-card.tsx:187 (`text-sm font-medium text-zinc-300`), canvas `aria-hidden="true"` à la ligne 180 ; src/components/wheel/scratch-experience.tsx:62 calcule `kermesse` mais ne le transmet pas à `<ScratchCard>` ; presets clairs dans src/lib/wheel-style.ts:395-396 et 449-450

**Impact.** Un joueur au clavier ou à la souris sans geste de glissement, sur une carte à gratter dont le commerçant a choisi un style clair, ne voit pas la seule porte de sortie de l'écran : il reste bloqué devant son gain sans pouvoir le révéler. La garde `play-contrast.test.ts` ne l'attrape pas — elle ne mesure que les quatre jetons de `playText`, pas les classes écrites en dur.

**Correction proposée** (coût S). Passer `kermesse` à `<ScratchCard>` et brancher le libellé sur `playText.body(kermesse)` comme le font les 20 autres composants de `src/components/wheel/`. Étendre ensuite `play-contrast.test.ts` d'une garde structurelle interdisant `text-zinc-3xx` en dur dans `src/components/wheel/`.

#### `P2` A11Y-4 — `text-zinc-400` sert de texte d'information sur fond clair : 2,62:1 sur blanc, 2,43:1 sur crème

**Constat.** Le dashboard est en `bg-k-bg` crème avec des cartes `bg-white` ; #9f9fa9 y ressort à 2,45–2,63:1 contre 4,5:1 requis. Une quinzaine de sites portent du texte réel dans ce jeton, dont une VALEUR DE DONNÉE (« Non » de l'opt-in marketing dans le tableau des participations), un bouton d'action (« Annuler… ») et des aides de formulaire.

**Preuve.** src/app/dashboard/participations/page.tsx:412 (« Non ») et :211 (aide ROI) ; src/components/dashboard/cancel-participation.tsx:34 (bouton) ; src/app/dashboard/settings/page.tsx:192 et :386 ; team-members.tsx:60 ; plan-catalog.tsx:78 ; webhook-form.tsx:88 ; onboarding-checklist.tsx:75 ; src/components/ui/ranking-picker.tsx:67 (« À choisir »). Fonds : src/app/dashboard/layout.tsx:117 (`bg-k-bg`), src/components/ui/card.tsx:26 (`bg-white`). Le ratio est déjà écrit dans le dépôt : qr-code-card.tsx:17 « `text-zinc-400` à ~2,3:1 »

**Impact.** Dans le tableau des participations, « Oui » (emerald-600, lisible) et « Non » (zinc-400, 2,6:1) ne se lisent pas à égalité — le commerçant lit mal la colonne consentement, celle qui décide de ses relances. Le ratio est connu et documenté depuis le correctif de la carte QR, mais aucune garde mécanique n'empêche le jeton de revenir : il est réapparu 15 fois.

**Correction proposée** (coût M). Basculer ces sites sur `text-k-muted` (#6b6459, 5,8:1 sur blanc / 5,4:1 sur crème — déjà défini et calibré pour exactement ce rôle, globals.css:23-26). Ajouter une garde de source, sur le modèle de `play-contrast.test.ts`, interdisant `text-zinc-400` hors `placeholder:` et `disabled:` dans `src/app/dashboard/` et `src/components/dashboard/`.

#### `P2` A11Y-5 — Modales sans piège de focus ; le Studio QR n'y déplace même pas le focus à l'ouverture

**Constat.** `QrDesigner` se déclare `aria-modal="true"` — ce qui masque tout le reste de la page pour un lecteur d'écran — mais ne déplace jamais le focus à l'ouverture : il reste sur le bouton « Personnaliser », désormais hors de l'arbre d'accessibilité. Aucune des deux modales ne piège la tabulation ni ne restitue le focus à la fermeture ; la modale du calendrier focalise bien sa croix mais laisse Tab s'échapper derrière l'overlay.

**Preuve.** src/components/dashboard/qr-designer.tsx:329-333 (`aria-modal`, `role="dialog"`) et :281-292 (effet Échap + verrou de scroll, aucun `focus()`) ; ouverture depuis src/components/dashboard/qr-code-card.tsx:98-101 et :138 ; src/components/calendar/calendar-tracker.tsx:809-812 et :751-758 (`closeRef.current?.focus()` seul)

**Impact.** Le Studio QR est la surface de personnalisation principale du commerçant. Un utilisateur au clavier l'ouvre et se retrouve avec le focus sur un élément que la modale vient de masquer ; ses tabulations suivantes parcourent une page invisible. `/dashboard/qr-codes` est pourtant scanné en vert — axe n'a aucune règle sur la gestion du focus, le scan ne pouvait pas le voir.

**Correction proposée** (coût M). À l'ouverture : `focus()` sur le premier élément focalisable de la modale (la croix de fermeture) ; à la fermeture : restituer le focus à l'élément déclencheur. Contenir Tab/Shift+Tab dans le conteneur `role="dialog"`. Le geste est le même pour les deux modales — factoriser dans un `useModalFocus` plutôt que le dupliquer.

#### `P2` A11Y-6 — Le vérificateur axe ignore `incomplete` ; le blocage limité à serious/critical est en revanche une politique assumée

**Constat.** `expectNoA11yViolations` ne lit que `results.violations` : `results.incomplete` — le verdict qu'axe rend quand il ne PEUT PAS conclure — n'est ni lu, ni loggé, ni attaché au rapport. Et comme seuls `serious`/`critical` bloquent, toute la famille structurelle qu'axe classe `moderate` (`heading-order`, `region`, `landmark-one-main`, `page-has-heading-one`) part en `console.log` sans jamais faire rougir la CI.

**Preuve.** e2e/axe.ts:59-84 (`BLOCKING_IMPACTS = {critical, serious}` ; seul `results.violations` est consulté). Le dépôt qualifie lui-même `incomplete` : src/components/wheel/play-backdrop.tsx:26-34 — « shell sorti de fixed → incomplete : vert par ABSTENTION […] rendent le capteur MUET au lieu de le rendre juste — c'est le vert qui ne vérifie rien » ; scripts/axe-stack-probe.mjs

**Impact.** Le mécanisme est déjà connu et déjà payé une fois : un contexte d'empilement introduit par mégarde bascule la règle `color-contrast` de `violations` vers `incomplete`, et le scan repasse au vert sans que personne ne mesure plus rien. Aucune garde n'empêche aujourd'hui cette bascule silencieuse. Sur les surfaces de dashboard, `heading-order` et `region` ne peuvent structurellement pas faire échouer un test.

**Correction proposée** (coût S). Faire échouer (ou au minimum attacher au rapport et compter) les entrées de `results.incomplete` pour la règle `color-contrast`, avec liste d'exclusions justifiée au site d'appel comme le fait déjà `disableRules`. Décider explicitement du sort de `moderate` : soit bloquant, soit consigné dans un compteur suivi — le `console.log` actuel n'est lu par personne en CI.

#### `P2` A11Y-1 — Le filet axe ne couvre ni le quiz joueur, ni réglages/campagne/onboarding, ni l'admin, ni l'auth

**Constat.** 18 specs sur 31 posent un scan axe ; 7 n'en posent aucun, dont `quiz.spec.ts` qui joue tout le parcours joueur `/quiz/e2e-quiz` sans jamais scanner. Aucune surface d'authentification, aucune page `/admin/*`, ni `/onboarding`, `/portefeuille`, `/commande/[token]`, `/poster/[id]`, `/pronos/[slug]/tv`, `/newsletter/unsubscribe`, `/dashboard/participations`, `/dashboard/settings/*`, `/dashboard/team` n'est jamais visitée par un scan. `/dashboard/campaigns/[id]` et `/dashboard/settings` sont visitées mais jamais scannées.

**Preuve.** e2e/quiz.spec.ts:78 (goto sans scan) ; 0 occurrence de `expectNoA11yViolations` dans quiz/scanner/newsletter/player-lose/campaign-templates/pronostics-generic.spec.ts ; précédent chiffré dans src/components/dashboard/qr-code-card.tsx:14-20 — « le premier scan axe de cette page a levé 40 nœuds color-contrast en serious, tous ici […] jamais scannée parce que la page qui la porte ne l'était pas »

**Impact.** Le dépôt a déjà mesuré ce que coûte une page non scannée : 40 violations serious découvertes d'un coup. Les constats A11Y-3 et A11Y-4 ci-dessous vivent précisément sur les pages restées hors du filet — ce n'est pas une hypothèse, c'est le même mécanisme qui rejoue.

**Correction proposée** (coût L). Ajouter un scan en fin de parcours dans les 7 specs qui n'en ont pas (à commencer par `quiz.spec.ts`, seul module joueur entier sans filet), et une spec de balayage type `a11y.spec.ts` sur les surfaces jamais visitées : `/login`, `/signup`, `/onboarding`, `/portefeuille`, `/dashboard/participations`, `/dashboard/settings`, `/dashboard/campaigns/[id]`. Traiter les violations levées avant d'élargir davantage.

#### `P3` A11Y-7 — L'échec du scanner caméra en caisse n'est annoncé à aucun lecteur d'écran

**Constat.** Le message d'erreur du scanner (caméra refusée, indisponible, décodage impossible) est inséré dans le DOM au moment où il apparaît, dans un `<p>` nu — sans `role="alert"` ni `aria-live`. Un nœud porteur de texte inséré après coup n'est pas annoncé.

**Preuve.** src/components/dashboard/qr-scanner.tsx:223 — `{error && <p className="mt-2 text-sm text-red-600">{error}</p>}`. Convention contraire établie et documentée dans le dépôt : src/components/ui/toast-enregistrement.tsx:22-35 (« role="alert" (assertif) pour un échec, conformément à la convention du dépôt […] une région live insérée dans le DOM en même temps que son texte n'est pas annoncée de façon fiable »)

**Impact.** En caisse, le commerçant lance le scan, la caméra échoue, et rien ne le lui dit s'il n'a pas les yeux sur la zone du message. La saisie manuelle du code existe en repli, ce qui borne le dommage — d'où P3 et non P2. `e2e/scanner.spec.ts` ne pose aucun scan axe, mais axe n'aurait de toute façon pas vu ce défaut.

**Correction proposée** (coût S). Ajouter `role="alert"` sur le `<p>` d'erreur et le rendre TOUJOURS présent (vide au repos), comme `ToastEnregistrement` le fait pour son conteneur.

### Parcours commerçant

*Couverture réelle* : Inspecté en lecture seule : l'arborescence complète de src/app/dashboard (33 routes), src/components/dashboard (nav, hero « prochaine action », centre d'animation, tableau d'équipe, conseiller, éditeurs des neuf modules, caisse), src/app/onboarding, src/lib/conseiller-commercant.ts, src/lib/checklist/, src/lib/activation/, src/lib/centre-animation-server.ts, plus les migrations concernées (compteurs du centre d'animation, gardes de publication, parrainage, équité économique, digest hebdomadaire). Croisement systématique des 110 tables, 231 fonctions et des colonnes de quinze tables commerçantes du schéma généré contre l'intégralité du corpus TypeScript, pour isoler ce que la base porte sans qu'aucun code applicatif ne le touche — c'est ce croisement qui a produit EXP-1, EXP-4 et une partie d'EXP-5. Rien n'a été exécuté : ni tests, ni build, ni Playwright, ni Supabase, conformément à la consigne ; les constats sont donc dérivés du code et non d'une session réelle, et je n'ai pas pu mesurer ce qu'un commerçant voit à l'écran ni chronométrer un parcours. Non couverts : les surfaces joueur publiques, le back-office admin, la facturation Stripe, et l'e-mail/SMS transactionnel au-delà de leur point d'entrée commerçant ; les constats connus C1 à C8 n'ont pas été rejoués, sauf C2 effleuré via les gardes de publication et laissé hors rapport faute de vérification suffisante.

#### `P2` EXP-1 — Parrainage : rupture de stock enregistrée en base, invisible sur tout écran commerçant

**Constat.** `validate_referral` refuse la récompense dès que le stock est atteint et écrit une ligne de traçabilité `referral_rewards(out_of_stock = true)`. Aucun code TypeScript ne lit ni `referral_rewards.out_of_stock`, ni les trois compteurs `sponsor_reward_claimed_count` / `filleul_reward_claimed_count` / `chest_reward_claimed_count` que la base maintient. Le module n'a par ailleurs aucune page de résultats : il est exclu du menu et son seul écran est un formulaire replié dans le détail d'une campagne.

**Preuve.** supabase/migrations/20260729120000_referral.sql:403-427 (décrément conditionnel puis insert `out_of_stock`) ; src/components/dashboard/referral-program-settings.tsx:405-418 (le stock se saisit, jamais ne se relit) ; src/components/dashboard/nav.tsx:195-209 (kind `referral` exclu du menu) ; grep `out_of_stock` et `*_claimed_count` sur src/ hors types générés : zéro lecteur.

**Impact.** Le programme de parrainage cesse de payer sans un mot. Le parrain a partagé, le filleul a joué, et personne ne reçoit rien : le commerçant l'apprend par un client mécontent, alors que la base sait exactement combien de versements ont été refusés et pourquoi. La roue, elle, a un seuil de stock bas, une alerte e-mail et une tuile — le parrainage n'a aucun des trois.

**Correction proposée** (coût M). Afficher, dans le bloc « Partage et parrainage » de la page campagne, les trois compteurs consommé/stock, et remonter `referral_rewards.out_of_stock` en signal : une tuile du Centre d'animation ou une tâche d'équipe « N récompenses de parrainage refusées faute de stock », avec le même traitement que `lowStockPrizes`.

#### `P2` EXP-2 — Le hero « prochaine action » envoie sur /dashboard/campaigns un fait compté sur neuf modules

**Constat.** Les compteurs `drafts` et `liveExperiences` balaient les neuf modules publiables. Le hero pointe pourtant `/dashboard/campaigns` pour les deux cas, puis masque la tâche d'équipe correspondante — laquelle pointait ailleurs (`/dashboard/discover`, `/dashboard/settings/modules`), et la tuile du Centre d'animation pointe encore vers une troisième destination (`/dashboard/qr-codes?etat=...`). Un même fait a donc trois destinations, et le hero impose la seule qui ne liste rien.

**Preuve.** src/components/dashboard/prochaine-action-state.ts:114-124 et :138-146 (hrefs `/dashboard/campaigns`), :265-271 (TACHE_PAR_HERO masque la tâche) ; src/lib/centre-animation-server.ts:141 et :161 (autres destinations) ; src/app/dashboard/page.tsx:152-157 (destinations des tuiles) et :369 (`masquer`) ; supabase/migrations/20260914120000_centre_animation_counts.sql:110-145 (les compteurs agrègent les neuf modules) ; src/app/dashboard/campaigns/page.tsx:88-92 (« Aucune campagne pour l'instant »).

**Impact.** Un commerçant dont les brouillons sont une chasse et un quiz lit « 2 animations en brouillon → Reprendre un brouillon », clique, et tombe sur « Aucune campagne pour l'instant ». Le premier bloc du tableau de bord se contredit lui-même, et la seule ligne qui menait au bon endroit vient d'être cachée par ce même bloc.

**Correction proposée** (coût S). Faire porter aux candidats `brouillons` et `rien-ouvert` la même destination que la tâche d'équipe qu'ils masquent (une liste réellement filtrée sur les brouillons tous modules confondus), ou ne masquer la tâche que lorsque les deux hrefs coïncident.

#### `P2` EXP-3 — Suppression d'une question de soirée sans confirmation ni garde de statut

**Constat.** Le bouton « Supprimer » d'une question d'événement soumet directement, sans `confirm` ni deuxième temps. `deleteEventQuestion` ne vérifie aucun statut : la question part même si le jeu est actif ou la session terminée. La clé étrangère `event_answers → event_questions` est `on delete cascade`, donc toutes les réponses déjà données disparaissent avec elle.

**Preuve.** src/components/dashboard/event-editor.tsx:424-433 (form nu, aucune confirmation) ; src/actions/events.ts:1133-1165 (aucune garde de statut) ; supabase/migrations/20260727120000_events_live.sql:259-260 (`foreign key (question_id, organization_id) ... on delete cascade`). À comparer avec le même fichier : :255 (suppression du jeu derrière une confirmation saisie) et :968-990 (suppression de session derrière une case cochée après un refus nommé).

**Impact.** Pendant une soirée, un doigt qui glisse sur mobile efface une manche et recalcule le classement : les points attribués à cette question s'évaporent, sans annulation possible. Les deux autres suppressions du même écran sont, elles, protégées — le geste le plus fréquent est le seul qui ne l'est pas.

**Correction proposée** (coût S). Aligner sur la suppression de session : refus par défaut quand des `event_answers` existent, message nommant le nombre de réponses perdues, puis case de confirmation explicite ; et interdire la suppression tant qu'une session est `live`.

#### `P3` EXP-4 — Plafonds de distribution en base, trigger armé, sans aucun chemin d'interface

**Constat.** `experience_economic_policies` (mode monitor/enforce, plafond total, plafond par joueur) et son journal `economic_policy_events` sont créés, exposés en RLS à l'éditeur en écriture, et un trigger `before insert` sur `reward_issuances` les applique à chaque récompense émise. Aucun fichier de src/ ne mentionne ces tables — ni action, ni page, ni type. Aucun test pgTAP ne les couvre non plus.

**Preuve.** supabase/migrations/20260805190000_security_equity.sql:1296-1343 (table + policy « editor write »), :1409-1495 (fonction + `create trigger reward_issuances_economic_policy`) ; grep « economic » sur src/ et supabase/tests/ : zéro occurrence hors types générés ; docs/audit-3-backlog.md:244 marque pourtant la ligne « Règle économique centrale » comme ✅.

**Impact.** Le commerçant n'a aucun moyen de plafonner ce qu'une animation distribue au total ou par joueur : la seule borne reste le stock par lot. Le filet est écrit, testé par personne, atteignable par personne — et le backlog le compte comme livré, ce qui garantit qu'il ne sera pas branché.

**Correction proposée** (coût M). Soit brancher un réglage « plafond de distribution » par expérience (une case `monitor`/`enforce` + deux nombres) sur la page détail du module concerné, avec lecture d'`economic_policy_events` en regard ; soit retirer la ligne ✅ de docs/audit-3-backlog.md et documenter la capacité comme non exposée.

#### `P2` EXP-5 — Le fuseau se règle, la moitié des écrans commerçant l'ignore

**Constat.** `formatDate` retombe sur `Europe/Paris` quand aucun fuseau n'est passé. Sur 51 appels des surfaces commerçant, 25 ne passent pas le fuseau de l'établissement. Le cas le plus net : l'échéance d'un lot de pronostics est rendue avec le fuseau de l'organisation en caisse, et avec le repli Europe/Paris sur l'écran de gestion du championnat.

**Preuve.** src/lib/utils.ts:80-85 (`timeZone: string = FUSEAU_DEFAUT`, ligne 42 : `Europe/Paris`) ; src/components/dashboard/timezone-form.tsx:6-16 (liste offrant Pacific/Tahiti, Pacific/Noumea, Indian/Reunion, America/Martinique) ; src/app/dashboard/redeem/page.tsx:908 (`formatDate(award.redeem_expires_at!, fuseau)`) contre src/components/dashboard/contest-settings.tsx:1573-1574 (même valeur, sans fuseau) ; aussi src/components/dashboard/campaign-automation.tsx:260,272,289 (dates de programmation) et src/components/dashboard/team-members.tsx:65,156.

**Impact.** Pour un commerce à Tahiti (12 h d'écart) ou à La Réunion, la date de fin de campagne, l'échéance d'un code et l'expiration d'une invitation sont fausses d'une demi-journée à un jour entier — et deux écrans du produit affichent deux dates différentes pour le même instant. Le réglage existe, il est proposé, il ne produit d'effet que sur la moitié de l'application.

**Correction proposée** (coût M). Passer `organization.timezone` aux 25 appels restants (les pages serveur l'ont déjà en main ; les composants clients concernés le recevront en prop), et ajouter un test qui interdit un appel à `formatDate` sans second argument dans src/app/dashboard et src/components/dashboard.

#### `P2` EXP-6 — Deux pages de réglages écrites pour l'éditeur, aucun lien ne l'y mène

**Constat.** `/dashboard/settings/automations` autorise explicitement l'éditeur, et `/dashboard/settings/modules` a été conçue pour lui (elle ne redirige pas et affiche « seul le propriétaire peut les acheter, demandez-lui »). Or les seuls liens vers ces deux pages vivent sur `/dashboard/settings`, qui redirige tout non-propriétaire, et le groupe « Gestion » du menu n'existe que pour le propriétaire. La tâche d'équipe qui pointait vers les options est `availableTo: ["owner"]`.

**Preuve.** src/app/dashboard/settings/automations/page.tsx:20 (redirige seulement les caissiers) ; src/app/dashboard/settings/modules/page.tsx:33-39 et :112-118 (parcours éditeur explicite) ; src/app/dashboard/settings/page.tsx:54 (`if (role !== "owner") redirect`) et :269-270, :289-290 (uniques liens) ; src/components/dashboard/nav.tsx:79-85 et :221-223 (groupe « Gestion » réservé au propriétaire) ; src/lib/centre-animation-server.ts:159-161.

**Impact.** L'éditeur à qui on a confié « les campagnes et la caisse » ne peut atteindre les automatisations et le catalogue d'options qu'en tapant l'URL. Le travail d'accueil fait sur ces deux pages — dont un message écrit spécialement pour lui — n'est vu par personne.

**Correction proposée** (coût S). Ajouter au menu un groupe « Gestion » réduit pour l'éditeur, portant « Automatisations » et « Options », ou exposer ces deux entrées depuis un écran qu'il atteint déjà (Vue d'ensemble ou Découvrir).

#### `P3` EXP-7 — Quatre scénarios d'e-mail réglables, aucun retour sur ce qui a été envoyé

**Constat.** La page Automatisations propose un interrupteur et des délais par scénario, et s'arrête là : pas de dernier envoi, pas de compteur, pas d'aperçu. Le journal `email_log` n'est lu que par les crons. Le résumé hebdomadaire ne les mentionne pas. La page Newsletter, sur le même canal et les mêmes destinataires, affiche pourtant un historique complet avec statut et nombre d'envois.

**Preuve.** src/components/dashboard/automation-settings.tsx:93-190 (formulaire seul, aucun retour) ; grep `email_log` sur src/ : seulement src/lib/automations.ts:314 et src/lib/calendar-reminders.ts:102 (crons) ; supabase/migrations/20260821120000_weekly_digest.sql (aucun champ d'automatisation) ; contraste : src/app/dashboard/newsletter/page.tsx:104-137.

**Impact.** Le commerçant règle « relance 48 h après un gain non retiré », puis n'a aucun moyen de savoir si un seul e-mail est parti. Face au doute il rallume, change le délai, ou conclut que la fonction ne marche pas — un réglage dont l'effet n'est visible nulle part finit par n'être plus réglé du tout.

**Correction proposée** (coût M). Afficher par scénario, depuis `email_log`, le nombre d'envois sur 30 jours et la date du dernier — la même carte que l'historique newsletter, en lecture seule.

#### `P3` EXP-8 — Deux relances d'inactifs coexistent, avec un simple bandeau d'avertissement

**Constat.** « Réengagement automatique » (Réglages) et le scénario « Clients inactifs » (Réglages > Automatisations) visent la même population — contacts opt-in marketing inactifs — par le même canal. Les deux se règlent séparément, sur deux pages, avec deux vocabulaires. La réponse actuelle est un bandeau d'avertissement affiché quand les deux sont actifs.

**Preuve.** src/app/dashboard/settings/page.tsx:253-259 (ReengageToggle) ; src/lib/reengagement.ts:9-14 et :55-58 (`org_reengagement_targets`, cooldown 30 j) ; src/components/dashboard/automation-settings.tsx:26-30 (scénario `inactive`) et :86-91 (« un même contact peut recevoir deux relances proches »).

**Impact.** Le commerçant doit deviner lequel des deux régler, et le produit lui annonce qu'en réglant les deux il enverra des doublons à ses clients — sans lui dire lequel désactiver ni ce qui les distingue. La qualité perçue de la relance repose sur une inférence que rien à l'écran ne soutient.

**Correction proposée** (coût M). Fusionner les deux sous « Clients inactifs » (le réengagement automatique devient un préréglage de paliers), ou, à défaut, nommer l'écart dans les deux écrans et proposer un bouton qui éteint l'autre depuis le bandeau d'avertissement.

### Dette, couverture de tests, livraison

*Couverture réelle* : Inspecté en lecture seule : les 4 workflows GitHub Actions (ci, production-health, concurrency, flaky-measure), vitest.config.ts, playwright.config.ts, package.json et les 4 scripts `node --test`, les 31 specs Playwright (titres, skips, conditions de projet), la liste des 58 suites pgTAP croisée avec la commande CI, et src/lib/release.ts. Analyses outillées écrites dans le scratchpad puis exécutées : recensement des exports jamais référencés hors de leur fichier (416 bruts, ramenés à 98 valeurs puis vérifiés un par un pour éliminer les usages internes — `construireActionsEquipe`, `fetchLeagueFixtures`, `requireOrganizationMember`, `CAMPAIGN_TEMPLATES` étaient des faux positifs et sont écartés), recherche de modules sans importeur de production, recherche de tests s'auto-mockant (1 seul, partiel via `importOriginal`, donc sain), et recensement des blocs `it()` dont toutes les assertions vivent dans une boucle. Le croisement des 15 modules avec e2e/ et supabase/tests/ a été fait fichier par fichier.  NON inspecté : aucune suite n'a été EXÉCUTÉE (consigne : ni npm test, ni build, ni Playwright, ni supabase) — tous les constats de code mort sont statiques et ne prouvent pas l'absence d'appel dynamique par chaîne, même si aucun `import()` variable n'a été trouvé. `npm audit` n'a pas été lancé (réseau) : je n'ai donc rien à dire sur les vulnérabilités réelles, seulement constaté que le job existe et bloque à `moderate`. Je n'ai pas relu les 265 fichiers de test un par un : le tri des assertions tautologiques est passé par un balayage automatique dont j'ai vérifié manuellement une trentaine de cas ; d'autres tests vacuous peuvent subsister. Les workflows `concurrency.yml` et `flaky-measure.yml` n'ont été lus qu'en en-tête (déclenchement manuel, ils ne gardent rien en continu).

#### `P0` MORT-1 — Jackpot « mode staff » : le joueur affiche un QR que personne ne peut scanner

**Constat.** `participateJackpotStaff` (src/actions/jackpot.ts:472) n'a AUCUN appelant dans tout le dépôt — seul son propre test en cite le nom. Le joueur, lui, demande bien un jeton de check-in (`getJackpotCheckinToken`, src/components/jackpot/jackpot-tracker.tsx:969) et affiche le QR. Le pendant fidélité existe pourtant (src/components/dashboard/loyalty-staff-stamp.tsx:62 appelle `stampLoyaltyVisitStaff`) : l'asymétrie est le signal.

**Preuve.** src/actions/jackpot.ts:472 (définition), grep global : 0 importeur hors src/actions/jackpot.test.ts ; src/components/jackpot/jackpot-tracker.tsx:969 ; src/components/dashboard/loyalty-staff-stamp.tsx:62 ; src/lib/validations/jackpot.ts:26 (`validation_mode` accepte "staff")

**Impact.** Un commerçant peut choisir le mode « staff » dans l'atelier cagnotte (le pas est même testé en E2E, e2e/atelier-modules.spec.ts:482) et se retrouver avec une cagnotte impossible à valider en boutique : le client montre son QR, aucun écran de l'équipe ne le lit. Toutes les couches sont vertes — pgTAP jackpot.test.sql prouve la RPC, l'E2E prouve le réglage — parce qu'aucune ne traverse le milieu.

**Correction proposée** (coût M). Soit brancher l'écran manquant (calqué sur loyalty-staff-stamp.tsx, réutilisant qr-scanner.tsx), soit retirer `staff` de `jackpotValidationModeSchema` et l'action morte. Dans les deux cas, ajouter un test E2E qui part du QR joueur et finit sur la validation.

#### `P2` TEST-1 — Quatre modules sur cinq n'ont que des E2E d'affichage

**Constat.** Confirme et élargit le constat Codex C8. Jackpot : 2 tests (affichage + 404). Fidélité : 2 tests (affichage + 404). Événement live : 3 tests (lobby joueur, écran de salle, 404) — le fichier le dit lui-même, « pas un cycle de jeu complet ». Calendrier : 3 tests, dont le seul qui écrivait est désactivé en `test.fixme`. Aucun clic ne déclenche jamais une participation cagnotte, un tampon fidélité, un cycle question→révélation→podium, ni une case de calendrier depuis le dashboard.

**Preuve.** e2e/jackpot.spec.ts:30 et :84 ; e2e/loyalty.spec.ts:48 et :90 ; e2e/event.spec.ts:24-88 (commentaire d'en-tête : « pas sur un cycle de jeu complet ») ; e2e/calendar.spec.ts:142 (`test.fixme`, FIXME(seed-isolation) documenté lignes 130-141)

**Impact.** C'est exactement le trou par lequel MORT-1 est passé : la chaîne bouton → action serveur → RPC n'est prouvée nulle part sur ces quatre modules. Un régression de câblage (import supprimé, action renommée, formulaire non soumis) passe typecheck, Vitest, pgTAP et CI sans une seule rougeur.

**Correction proposée** (coût L). Un E2E d'écriture par module, minimal mais réel : cagnotte (saisie du code tournant → jauge qui avance), fidélité (tampon → palier), événement (télécommande authentifiée : question → révélation), calendrier (ré-activer le fixme en lui donnant une case dédiée jamais ouverte plutôt qu'en partageant la case 1 du seed).

#### `P3` DETTE-1 — Barème de pronostics en double : la copie TypeScript est morte

**Constat.** `scorePrediction` (src/lib/pronostics.ts:125), `scoreAnswer` (:314) et `rankPlayers` (:480) n'ont AUCUN appelant de production — ni interne au fichier, ni ailleurs. Le calcul réel vit en SQL (`coalesce(nullif(v_scoring->>'exact','')::integer, 3)` etc.). Le commentaire de `scoreAnswer` le dit : « MIROIR STRICT de la fonction SQL `contest_generic_points`, seule autorité en base » — mais rien ne vérifie que le miroir reste fidèle.

**Preuve.** src/lib/pronostics.ts:125, :314, :480 (grep : seule occurrence hors commentaire) ; src/lib/pronostics.test.ts:51 (describe scorePrediction) et :103 (describe rankPlayers) ; supabase/migrations/20260721150000_contest_rules_and_awards.sql:612-613 et 20260801120000_generic_contests.sql (l'autorité réelle)

**Impact.** Deux définitions du même barème peuvent diverger sans que rien ne le signale, et les tests verts de `pronostics.test.ts` donnent une confiance qui ne porte sur rien : ils prouvent la copie, pas le produit. Le jour où le barème SQL change, la suite reste verte.

**Correction proposée** (coût S). Supprimer les trois fonctions et leurs describes (le SQL est déjà couvert par supabase/tests/generic_contests.test.sql et contest_leaderboard.test.sql). Si on veut garder un miroir, le rendre exécutable : un test pgTAP qui joue les mêmes vecteurs que le test TS, ou un test TS qui appelle la RPC.

#### `P3` DETTE-2 — La télémétrie d'expérience côté TypeScript n'est jamais appelée

**Constat.** `captureExperienceEvent` (src/lib/experience-analytics.ts:128) est le seul appelant TS de la RPC `record_experience_event`, et il n'a lui-même aucun appelant — ni dans src/actions, ni dans src/app. La table `experience_events` est en réalité alimentée par des triggers SQL. Le module TS (165 lignes) et son test (113 lignes) décrivent donc un chemin d'écriture inexistant : catalogue `EXPERIENCE_EVENT_NAMES`, garde anti-PII sur les clés de metadata, schéma Zod — tout cela ne s'exécute jamais en production.

**Preuve.** src/lib/experience-analytics.ts:128 et :140 (`admin.rpc("record_experience_event")`) ; grep global : 0 appelant hors src/lib/experience-analytics.test.ts ; supabase/migrations/20260805160000_experience_analytics.sql:395, :986, :1000 (les `insert into public.experience_events` réels, côté trigger)

**Impact.** Un développeur qui ajoute un `EXPERIENCE_EVENT_NAMES` ou durcit la garde anti-PII croit modifier le produit et ne modifie rien. Symétriquement, la garde anti-PII effective est celle du SQL, qu'aucun test TS ne couvre.

**Correction proposée** (coût S). Supprimer `captureExperienceEvent` et `experienceEventSchema` s'ils sont définitivement remplacés par les triggers ; sinon documenter dans le fichier que c'est un chemin de secours et le brancher au moins une fois. La liste d'événements ne doit exister qu'à un seul endroit.

#### `P3` CI-1 — `casts:check` ne surveille qu'une forme de cast sur trois

**Constat.** Le garde ne détecte que la chaîne `as unknown as` (scripts/check-unsafe-casts.mjs:10) et l'annule dès qu'un commentaire `unsafe-cast-justification: <quoi que ce soit>` figure sur la ligne ou la précédente (:11, :44-46). Mesuré : 40 doubles casts hors tests, dont 28 déjà « justifiés » donc invisibles au garde, ET 152 assertions simples (`(data ?? []) as SomeRow[]`) qu'il ne compte pas du tout.

**Preuve.** scripts/check-unsafe-casts.mjs:10-11 et :36-48 ; scripts/unsafe-casts-baseline.json (32 entrées) ; échantillons non vus par le garde : src/actions/experience-blueprints.ts:460, src/actions/calendar.ts:677, src/actions/meta-progression.ts:202

**Impact.** Le dépôt a déjà payé la dérive des types Supabase (une signature SQL modifiée sans régénérer les types). Une assertion simple sur un résultat de requête absorbe exactement cette dérive : le champ disparaît du schéma, TypeScript reste vert, le code lit `undefined` en production. Le nom du script laisse croire que ce risque est gardé.

**Correction proposée** (coût M). Étendre le comptage aux assertions simples portant sur un résultat de requête (`) as X[]`, `data as X`) avec le même mécanisme de baseline, et exiger de la justification qu'elle cite une raison structurée (ex. `unsafe-cast-justification: postgrest-embed`), pas une chaîne quelconque.

#### `P3` CI-2 — Le test du contrôleur de santé post-déploiement n'est lancé par aucun workflow

**Constat.** `npm run test:production-health` (scripts/verify-production-health.test.mjs, 101 lignes) existe dans package.json mais n'apparaît dans aucun des quatre workflows. La CI lance bien `test:casts`, `test:migrations` et `test:sql` — le quatrième `node --test` du dépôt a été oublié. Le script qu'il teste, lui, s'exécute en bloquant après chaque déploiement de production.

**Preuve.** package.json ligne "test:production-health" ; .github/workflows/ci.yml (seuls `npm run test:casts` l.56, `test:migrations` l.136, `test:sql` l.144) ; .github/workflows/production-health.yml:31 lance `node scripts/verify-production-health.mjs` sans son test

**Impact.** Une régression dans le contrôleur de santé (parsing de la réponse /api/health, seuil de worker) part en production sans être vue, et se manifeste au pire moment : soit en faux vert après un déploiement cassé, soit en faux rouge qui bloque une livraison saine.

**Correction proposée** (coût S). Ajouter `npm run test:production-health` au job `quality` de ci.yml, à côté de `test:casts`. Une ligne.

#### `P3` TEST-2 — Le filet CSP « aucune route à nonce n'est prérendue » passe à vide sans build de production

**Constat.** Le test s'auto-neutralise quand `.next/server/app` est absent (`expect(statSafe).toBeUndefined(); return;`). Pire, quand ce dossier existe mais provient d'un `next dev` : le parcours ne trouve aucun `.html`, la boucle n'exécute aucune assertion, et le test est vert en ayant inspecté zéro fichier. La CI a corrigé le cas absent (build avant tests, commentaire ci.yml l.60-68) mais pas le cas « build de dev ».

**Preuve.** src/lib/security-headers.test.ts:261-271 (branche de neutralisation) et :281-291 (boucle sur `htmlFiles`, muette si vide) ; .github/workflows/ci.yml, step « Build de production » placé avant « Tests unitaires »

**Impact.** La consigne de projet est « vérifier en local d'abord ». En local, ce filet — qui garde une panne totale : route classée `sensitive` mais prérendue, donc `'strict-dynamic'` sans nonce, donc plus aucun script — est vert sans rien garder. On croit l'avoir joué.

**Correction proposée** (coût S). Faire échouer explicitement quand la boucle n'a rien inspecté (compter les fichiers HTML et exiger un compte > 0 dès que le dossier existe), et rendre l'absence de build bruyante : `it.skipIf(!buildPresent)` plutôt qu'un `return` silencieux.

#### `P3` MORT-2 — Code mort résiduel : LumozGuide, previewExperienceBlueprint, getSmsPackPriceId

**Constat.** `LumozGuide` (src/components/marketing/lumoz-guide.tsx:81, 386 lignes) et son modèle 3D (src/components/marketing/lumoz-model.ts, 261 lignes) ne sont référencés que par un commentaire de la landing. `previewExperienceBlueprint` (src/actions/experience-blueprints.ts:402) et `getSmsPackPriceId` (src/lib/stripe.ts:529) n'ont, chacun, qu'une seule occurrence dans tout le dépôt : leur définition.

**Preuve.** src/app/page.tsx:1049-1050 (« importer LumozGuide … et monter <LumozGuide /> ici » — en commentaire JSX) ; src/components/marketing/lumoz-guide.tsx:81 ; src/actions/experience-blueprints.ts:402 ; src/lib/stripe.ts:529

**Impact.** 647 lignes de composant marketing et deux actions serveur exportées entrent dans le typecheck, le lint, le build et l'analyse CodeQL de chaque PR sans jamais servir. Une action serveur exportée est aussi une surface : elle reste appelable par l'infrastructure Next même sans formulaire.

**Correction proposée** (coût S). Supprimer les quatre. Si `LumozGuide` est une piste conservée, la sortir dans une branche d'archive comme l'a fait le projet pour la direction artistique — un commentaire d'intention ne tient pas 386 lignes en vie.

#### `P3` TEST-3 — Le Studio créatif (affiches) n'a ni E2E ni pgTAP dédié

**Constat.** `src/components/dashboard/poster-editor.tsx` (858 lignes) et la page publique `src/app/poster/[id]/page.tsx` n'ont aucune spec Playwright (aucun fichier de e2e/ ne contient « poster ») et aucune suite pgTAP dédiée — seuls les ACL du bucket sont couverts, en passant, par storage_acl.test.sql. La seule couverture est `src/lib/poster.test.ts`, qui porte sur les gabarits, pas sur l'éditeur.

**Preuve.** e2e/ : 0 fichier contenant « poster » ; supabase/tests/ : aucun fichier poster*, seules mentions dans security_acl.test.sql et storage_acl.test.sql ; src/components/dashboard/poster-editor.tsx (858 l.) ; src/app/poster/[id]/page.tsx

**Impact.** Le Studio créatif est le module par lequel un commerçant produit son support physique. Un éditeur de cette taille sans aucun test d'intégration est le candidat le plus probable à la régression silencieuse — et l'échec s'y voit en boutique, sur du papier imprimé, pas dans un journal.

**Correction proposée** (coût M). Une spec E2E minimale : ouvrir l'éditeur sur l'affiche seedée, déplacer un élément, enregistrer, recharger et vérifier la persistance ; plus un chargement de la page publique `/poster/[id]` avec scan axe, comme les autres surfaces joueur.

---

## 6. Ce que cet audit n'a pas pu vérifier (10 angles morts)

1. Aucune variable d'environnement de PRODUCTION n'a pu être lue (lecture seule, pas d'accès Vercel). Au moins huit constats en dépendent : EVENTS_REALTIME_ENABLED (EVT-1 — l'absence n'est établie que pour le dépôt), UPSTASH_REDIS_REST_URL/TOKEN (change la nature du rate-limit d'une écriture Postgres à un appel Redis avec TTL, donc l'impact d'EVT-2 et de SEC-1 surface), NEXT_PUBLIC_POSTHOG_KEY et le DSN Sentry (TOK-1 : sans eux, la fuite de jeton dans l'URL n'a tout simplement pas lieu), APPLE_WALLET_* (SEC-5 : sans les cinq certificats la route rend 404 avant toute requête base et le constat est vide), LEGAL_* (LEG-1 : les mentions légales ne sont incomplètes que si les quatre variables sont vides), STRIPE_PRICE_ID_PASS_* (SD-1/3/5/6 : rien n'est encore vendable tant qu'ils n'existent pas). Ces vérifications tiennent en une session Vercel et devraient précéder la priorisation définitive.

2. La configuration du tableau de bord Stripe est hors dépôt. Elle décide à elle seule de SD-8 : le portail client est ouvert SANS paramètre `configuration` (src/actions/billing.ts:378-382), donc il PEUT déjà proposer le changement d'abonnement sans une ligne de code — auquel cas « aucun changement d'offre en libre-service » est faux et il ne reste qu'une incohérence d'affichage (l'écran oriente vers un mailto alors que le portail sait le faire). Sont aussi hors de portée : les événements webhook réellement abonnés, et les réglages de relance sur impayé.

3. L'état réel des workers en production n'a pas pu être interrogé. JOB-4 établit que `expire-trials` et `weekly-digest` sont insérés à `enabled = false` et qu'aucune migration ni aucun code applicatif ne les rallume — mais un UPDATE d'exploitation joué à la main en service_role suffirait et ne laisserait aucune trace dans le dépôt. Idem pour JOB-5 : l'absence de `schedule:` dans les quatre workflows ne prouve pas l'absence de surveillance, seulement que le dépôt n'en porte pas la preuve — docs/observability.md décrit le branchement d'un moniteur d'uptime externe comme un geste d'exploitation délibérément hors dépôt.

4. Rien n'a été EXÉCUTÉ, sur aucun des douze axes : ni pgTAP, ni Vitest, ni build, ni Playwright, ni EXPLAIN, ni npm audit. Conséquences directes : aucun plan de requête réel (les constats d'index et d'agrégation sont statiques), aucun chiffre de performance mesuré — les « ~150 req/s disponibles » sont une transposition ×2,5 d'une mesure locale que docs/perf-report.md:337-346 déclare lui-même non comparable entre deux runs — aucune vulnérabilité de dépendance vérifiée, et AUCUN défaut reproduit : tous sont établis par lecture du chemin de code.

5. Deux comportements de framework n'ont pas pu être tranchés sans navigateur, et deux constats en dépendent. (a) React 19 remonte-t-il un rejet d'action asynchrone dans `startTransition` jusqu'à la frontière d'erreur, ou laisse-t-il `pending` collé indéfiniment ? UI-4 et JOU-3 supposent le premier ; les deux modes sont dégradés, pas au même degré. (b) Un clic de souris sur un `<a>` déplace-t-il le focus sur Safari et Firefox ? Si non, la fenêtre de perte d'`useAutoSave` (UI-6) couvre aussi la navigation ordinaire du commerçant entre deux écrans, pas seulement le retour arrière et la bascule d'application — le constat serait alors nettement plus large que rapporté.

6. Les ratios de contraste des sept constats d'accessibilité sont calculés à la main depuis les jetons hexadécimaux de globals.css selon la formule WCAG 2.x, jamais mesurés dans un navigateur, et les couples texte/fond sont déduits du contexte de classes. Un fond composité inattendu pourrait déplacer un chiffre à la marge (jamais d'un facteur deux). L'ordre de tabulation réel et la visibilité effective du focus n'ont pas non plus été observés : A11Y-5 repose entièrement sur la lecture du code de gestion du focus et de l'ordre DOM.

7. Les mesures de poids de bundle proviennent du build `.next` COMMITÉ (BUILD_ID ixDuBWMQllbCIYSe1kn78, V1.56, 2026-08-09) alors que HEAD est 69774c8 du 2026-08-16 : les noms de chunks peuvent avoir bougé, et un module a pu être ajouté ou retiré depuis. Aucune mesure de terrain (LCP, CLS, TBT réels) n'existe — uniquement des poids statiques et le graphe de modules. Le critère de sortie d'un chantier PERF doit donc être « le chunk disparaît du manifest », jamais un gain de score supposé.

8. Le réglage `max_rows` du projet PostgREST HÉBERGÉ n'a pas pu être lu : supabase/config.toml:8 est la configuration LOCALE. Le volet le plus grave de LIST-1 — « le compte affiché devient SILENCIEUSEMENT FAUX et plafonné au-delà de 1000 lignes » — n'est donc pas établi ; seul le transfert inutile de lignes l'est. Même limite pour les privilèges par défaut du bootstrap hébergé, que supabase/migrations/20260720200500_service_role_table_grants.sql:1-14 déclare explicitement différents du local : pgTAP peut être vert en CI sur des privilèges qui ne sont pas ceux de la production (SEC-4).

9. Trois modules livrés n'ont été audités en profondeur par aucun axe : la Place de marché de campagnes, la Méta-progression et le Registre universel des récompenses (touché seulement de biais, par ses triggers). Le back-office admin n'a été survolé que sur ses points de contact avec les octrois et le monitoring. Le Studio créatif n'a par ailleurs ni E2E ni pgTAP dédié — poster-editor.tsx, 858 lignes, est le plus gros composant du dépôt sans test d'intégration — et cet audit n'a pas compensé ce trou : il l'a seulement constaté.

10. L'audit n'a pas mesuré ce qu'un commerçant ou un joueur VOIT : aucun parcours n'a été joué, aucun temps chronométré, aucune capture prise. Les constats d'expérience (hero qui envoie sur une liste vide, squelette trompeur, message d'erreur non annoncé) sont dérivés du code et de l'ordre DOM, pas d'une session réelle. Un défaut d'usage qui ne laisse aucune trace dans le code — un libellé ambigu, un ordre d'écran illogique, une étape qu'on ne trouve pas — est structurellement invisible à cette méthode. Une demi-journée de parcours guidé sur l'organisation de test rapporterait ce que douze auditeurs statiques ne peuvent pas voir.
