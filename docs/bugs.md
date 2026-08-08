# Known Issues & Bugs - Lastchance

## Critical

- **✅ Le canal SMS livré (V1.24, PR #80) était INERTE — aucun SMS ne
  pouvait partir (2026-08-01, branche `feat/canal-sms-utilisable`)** —
  `sms_sender_for_send` n'accorde un envoi qu'à un expéditeur au statut
  `declared`, atteint uniquement via les RPC `declare_sms_sender` /
  `set_sms_sender_status`. Ces RPC n'avaient **aucun appelant applicatif** :
  ni écran commerçant pour demander un expéditeur, ni panneau back-office
  pour le déclarer. Un gagnant qui laissait son téléphone ne recevait donc
  jamais son SMS, quel que soit le solde de crédits — le mécanisme de
  facturation, de segments et de STOP fonctionnait entièrement, pour un
  canal qui ne s'ouvrait jamais. La documentation du chantier précédent
  décrivait pourtant le canal comme livré, sans cette réserve. **Consigné
  sans l'adoucir : c'est la même classe de défaut que ce dépôt a déjà
  corrigée trois fois** (méta-progression sans appelant en V1.18, module
  Parrainage non basculable au back-office, quiz non poussé/non déployé) —
  une capacité écrite en base n'est pas une capacité livrée tant qu'aucun
  chemin applicatif ne l'atteint. Corrigé par les deux surfaces manquantes
  (`/dashboard/settings/sms`, panneau back-office) — voir
  `docs/roadmap.md` V1.25.

- **✅ Six crons déposaient des heartbeats hors de l'objectif de service
  (2026-07-31, PR #76)** — `20260805240000` avait inscrit les six crons
  quotidiens (`automations`, `calendar-reminders`, `jackpot-draws`,
  `purge-data`, `reengage`, `webhooks`) à `enabled = false`, avec un motif
  juste **à l'époque** : « faux tant que la route du worker n'écrit pas de
  heartbeat ». Mesuré, pas supposé : les six routes appellent toutes
  `startWorkerRunSafely`/`finishWorkerRunSafely` depuis des semaines — elles
  remplissaient donc `ops_worker_runs` **hors de `ops_workers_health()`**,
  donc hors de l'objectif de service du back-office. Une purge RGPD qui
  échouerait chaque nuit ne réveillerait personne. Même classe de défaut
  déjà payée ici (« un back-office qui n'enregistrait que ses succès »), en
  miroir : la trace existe, elle n'est lue par rien.

  **Une règle, pas une liste.** Migration `20260820120000` : un `UPDATE`
  conditionnel qui supervise tout worker ayant **déjà déposé un succès** —
  général et non énumératif, sans effet sur une base neuve (CI, poste de
  développement) où `ops_worker_runs` est vide. `expire-trials`, déployé le
  jour même sans avoir encore tourné, reste volontairement à `false` : on
  ne supervise pas une promesse.

  **Le contrôle négatif a demandé deux tours.** Premier tour : la règle ne
  rallumait rien, et la cause était invisible — l'insertion du heartbeat de
  test portait `2>/dev/null`, sur la commande dont l'échec était
  précisément l'information cherchée. Le contrôle ne prouvait donc rien,
  même défaut que ceux qu'on corrige : un échec avalé par conception.
  Second tour, erreurs visibles, six sondes numérotées, concluant
  (`INSERT 0 1`, `UPDATE 1`, supervisés devenant `jobs`, `purge-data`,
  `sync-contests`). **L'échec du premier tour reste inexpliqué** —
  l'information a été détruite avec la redirection, écrit ainsi plutôt que
  par une cause inventée.

  **Une assertion retirée parce qu'elle avait tort.** « Et aucun succès
  n'est enregistré », censée établir la prémisse du contrôle, est tombée :
  le fichier de test sème lui-même des exécutions plus haut pour éprouver
  la sonde de santé — elle mesurait l'état après ses propres insertions.
  Retirée plutôt que rafistolée.

  Preuve : pgTAP 31 fichiers / 2 079 assertions PASS (vide et semée),
  typecheck 0, lint 0, 123 fichiers / 1 997 tests. Voir ADR-053.

- **✅ Le plafond de mon propre workflow avait masqué 15 trouvailles — second
  passage : 11 confirmées, 4 réfutées (2026-07-31)** — la chasse par parcours
  vécu du même jour avait rendu 33 trouvailles ; le traitement n'en avait
  retenu que 14 (`serieux.slice(0, 14)`, précédé d'un
  `filter(gravite !== 'mineur')` qui écartait déjà les mineures), et « 14
  confirmées » a été rapporté comme un bilan complet — c'est l'origine de ce
  chantier. Les 15 sérieuses laissées de côté sont passées en **réfutation
  adversariale** : 11 tiennent (détail ci-dessous et dans les entrées
  suivantes), 4 sont fausses.

  **Les quatre réfutées, gardées parce qu'une réfutation motivée apprend
  autant qu'une correction** :
  - « Le plafond de dépense d'une campagne ne se déclenche jamais » — faux
    sur les deux faces : `automation.test.sql:34-37` prouve le déclenchement
    contre un vrai Postgres (150 puis 300 centimes sur un plafond de 200 →
    `paused`, `budget_reached`). Ce qui restait vrai, bien plus étroit, est
    traité à ce titre — voir « le coût d'un lot ne se saisissait qu'au second
    temps » plus bas.
  - « Un essai expiré fait perdre ses pages » — c'est le paywall, délibéré,
    documenté cinq fois dans `docs/decisions.md`, verrouillé par
    `subscription.test.ts:41`, sans perte de données. Seul le message du 404
    mentait sur la cause — voir plus bas.
  - « Le compte à rebours avant retrait est un défaut » — non, c'est ADR-017,
    une décision produit assumée, présentée à tort comme un bug.
  - « Les dates s'affichent en UTC » — réelle au moment de la trouvaille, mais
    déjà corrigée par la PR #71 quelques heures plus tôt.

- **✅ `settle_hunt_completions` accordait des lots sans aucune des quatre
  gardes de contexte — ÉLEVÉ (2026-07-31)** — la fonction affirmait trois
  fois (deux commentaires et son propre `comment on function`) accorder
  « exactement ce que le prochain scan aurait accordé », mais ne portait
  aucune des quatre gardes de `record_hunt_scan` : ni l'addon, ni le statut,
  ni les deux bornes de fenêtre — et `hunts.reward_stock` admet `null`, ce qui
  vaut illimité. Scénario exécutable par un simple éditeur : passer la chasse
  en brouillon (`setHuntStatus` ne garde que le passage vers `active`, ce qui
  lève le plancher « une chasse active garde deux étapes »), puis supprimer
  les étapes jusqu'à n'en garder qu'une — tout joueur avec un seul tampon
  devient complet, des centaines de codes `CHASSE-` réels et encaissables,
  sans plafond. `redeem_hunt_completion` les honore toutes sans vérifier ni
  le statut ni la fenêtre. Les trois textes mensongers disent désormais ce
  que le code fait. Gardes ajoutées à `settle_hunt_completions`.

  **Effet de bord du correctif, fermé le même jour** : une fois les quatre
  gardes posées, retirer une étape PENDANT que la chasse est en brouillon ne
  solde plus personne — les joueurs devenus complets restent sur une carte de
  victoire vide, plus rien ne rappelle la fonction. On avait échangé une
  émission massive contre un silence durable. Fermé en faisant courir le
  solde à la **réactivation** (passage vers `active`) : les quatre gardes
  repassent, la RPC exclut déjà les joueurs soldés donc l'appel est
  idempotent, et son échec ne remonte pas — refuser de rouvrir une chasse
  parce qu'un solde a raté serait une punition sans rapport.

  **Prévision ajoutée au refus de suppression d'étape** :
  `hunt_settlement_preview(p_hunt_id, p_removed_step_id)` rend ce que
  `settle_hunt_completions` accorderait si l'étape était supprimée — mêmes
  cinq gardes, plus la borne de stock à l'unité près — parce que le refus ne
  nommait qu'un chiffre sur deux (« N joueurs ont une chasse en cours » sans
  dire combien recevraient un code automatiquement, or c'est ce second
  chiffre qui coûte de l'argent). Le calcul n'est pas fait côté action : il
  demande un comptage de tampons PAR JOUEUR que PostgREST n'agrège pas.
  **Contrôle négatif initial invalide** : le test mourait avant la section
  visée sur un code `CHASSE-PREVIEW1` refusé par la contrainte de format
  (`I`/`1` hors de l'alphabet anti-confusion `[A-HJ-NP-Z2-9]`) — 13
  assertions au lieu de 35, sabotage et code sain rendaient le même résultat.
  Refait : 35/35, sabotage de la garde de statut fait tomber les deux
  assertions concernées.

  **Même forme, même jour, module différent — le calendrier** :
  `calendar_players.opened_count` est un compteur STOCKÉ ; les ouvertures
  cascadent avec les cases supprimées, et après une réduction de grille il ne
  décrit plus rien, dans les deux sens : un joueur qui n'avait ouvert que les
  cases 16-20 garde 5 pour zéro ouverture survivante et décroche la
  récompense d'assiduité sans avoir été assidu (en consommant le stock d'un
  autre) ; un joueur réellement complet (1-20) n'a plus aucune case à ouvrir
  et ne reçoit jamais rien. Guard d'émission ajoutée sur `addon_calendar` et
  le statut (2 gardes, pas 4 — `calendars` n'a pas de fenêtre, elle est par
  case). Le recomptage lui-même court dans TOUS les contextes ; seule
  l'émission est gardée. **Mon propre brouillon répétait l'erreur** avant
  d'être comparé ligne à ligne à `open_calendar_box`.

  **Reste ouvert, décision explicite** : `calendar_players.opened_count`
  reste désaligné après une réduction de grille dans le cas général (le
  recompte corrige l'affichage mais pas la conséquence sur les récompenses
  déjà distribuées) ; aucun rattrapage rétroactif global des chasses n'a été
  fait (émettrait des codes réels sans geste marchand et viderait le stock de
  chasses désertées).

- **✅ « Avoir un client Stripe » n'est pas « avoir un abonnement » — trois
  défauts, une même racine (2026-07-31)** — un état lu à travers un
  indicateur qui ne le porte pas.
  - **Le bouton d'abonnement disparaissait.** `ensureStripeCustomer` écrit
    `stripe_customer_id` à l'OUVERTURE de la page de paiement, jamais à
    l'encaissement, et rien ne le remet à `null` (le webhook ne traite pas
    `checkout.session.expired`). Un propriétaire qui cliquait « Retour » sur
    Stripe repartait avec un client Stripe, zéro abonnement, et plus jamais
    de bouton pour payer — à sa place le portail Stripe, qui ne sait pas
    créer d'abonnement. Discriminant remplacé par
    `stripe_event_created_at`, écrit seulement par
    `apply_stripe_subscription_event_v2` (donc seulement quand Stripe a
    réellement annoncé un abonnement). Logique extraite en fonction pure
    (`billingActions`). Une fenêtre que ce remplacement aurait rouverte est
    fermée explicitement : entre le retour de paiement et l'arrivée du
    webhook, la page dit « abonnement en cours d'activation » plutôt que de
    ré-afficher un bouton de paiement qui ferait payer deux fois.
  - **« Impayé » ne coupait rien.** L'action admin était le seul écrivain, tous
    langages confondus, à ne pas maintenir `past_due_since` (les deux
    écrivains SQL le font). Sans date, le délai de grâce n'expirait jamais :
    accès complet indéfiniment, roues publiques comprises. Formule reprise à
    l'identique des écrivains SQL.
  - **Le bandeau inventait une cause.** Il affirmait « votre dernier paiement
    a échoué » alors que `past_due` se pose par deux chemins distincts.
    Reformulé pour décrire l'état (« incident de paiement ») sans mentir dans
    aucun des deux cas.
  - **Accès offert avec un module refusé sans dire pourquoi.**
    `setMerchantCompAccess` était la seule des neuf actions écrivant une
    colonne `addon_*` sans `rejectStripeManagedEntitlements` : « Échec de la
    mise à jour », sans cause ni marche à suivre, rien d'appliqué. Garde
    ajoutée, **conditionnelle aux modules réellement demandés** — un accès
    offert sans module reste légitime sur une organisation Stripe.

  **✅ Clos le 2026-07-31 (PR #73)** : le `exists` du trigger
  `protect_stripe_managed_entitlements` ne filtrait pas sur `active`, donc un
  commerçant **résilié** restait bloqué à vie pour un accès offert — la cible
  naturelle de ce geste. Corrigé par `and e.active` (migration
  `20260818120000`). Les deux `throws_ok` de
  `subscription_entitlements.test.sql` ont été **remontées** sur l'abonnement
  vivant (avant résiliation), avec leur miroir après résiliation relisant la
  valeur plutôt qu'un simple `lives_ok`, et la frontière `past_due` contrôlée.
  `org_effective_entitlements` porte le même `exists` sans `active` et n'est
  **délibérément pas touchée** (aucun appelant applicatif ; y ajouter le
  prédicat ferait rejaillir les droits legacy d'un résilié si quelqu'un y
  bascule un jour l'application).

- **✅ Un essai que Stripe ne confirme pas restait `trialing` indéfiniment
  (2026-07-31, PR #73)** — demande du client. Un essai expiré sans
  souscription ne perdait pas l'accès (`hasActiveAccess` coupe déjà à
  `trial_ends_at`), mais le statut mentait : la base disait « en essai » sur
  des comptes finis depuis des mois, et le back-office comptait ces
  prospects parmi les essais en cours. Cron `expire-trials`
  (migration `20260819120000`), sur le modèle des huit crons existants,
  avec trois garde-fous : on **demande à Stripe** avant chaque bascule
  (`hasLiveStripeSubscription`) ; une **panne Stripe ne résilie personne**
  (organisation sautée et journalisée, réessai le lendemain) ; un abonnement
  **vivant chez Stripe** alors que le statut local dit `trialing` est un
  webhook perdu, remonté et non résilié. Délai de grâce de 3 jours — motif
  réel : la fenêtre de réessai d'un webhook Stripe, pas la protection contre
  le faux positif (assurée par la garde 1, la marge n'est que la seconde
  couche). 18 lecteurs de `trialing` audités, 7 modifiés ; `isTrialExpired`
  reçoit un discriminant `ever_subscribed` qui se replie sur `true` en cas de
  panne (dégrade vers le vague, jamais vers le faux), pour ne pas remplacer
  le bandeau « Votre essai gratuit est terminé » par un « abonnement inactif »
  générique sur la population visée. `comp_access` n'est délibérément **pas**
  exclu du calcul (droit orthogonal accordé par le back-office). Deux
  résidus corrigés dans la foulée : `ops_worker_runs.worker` est une clé
  étrangère — sans ligne de registre pour `expire-trials`, son heartbeat
  était refusé et `startWorkerRunSafely` avale son échec par conception (le
  cron aurait résilié des essais chaque nuit sans laisser de trace) ; et
  `resolveStripeEntitlements` rendait un couple non auto-cohérent (`[]`
  donnait un plan `core` sans droits, un prix d'addon seul donnait
  `planId: core` avec `core` absent) — corrigé en semant les droits du plan
  retenu en sortie. **Erreur introduite puis corrigée dans le même
  chantier** : la migration du registre ajoute un 9ᵉ worker,
  `ops_monitoring.test.sql` épinglait « les huit workers » en dur → CI rouge,
  corrigé en nommant la différence (`results_eq`) plutôt qu'en comptant, pour
  qu'un worker ajouté et un worker perdu ne se confondent plus dans un total.
  **✅ CLOS le 2026-07-31 (PR #76)** : voir « Six crons déposaient des
  heartbeats hors de l'objectif de service » en tête de cette section —
  `expire-trials` reste volontairement `false` tant qu'il n'a pas déposé un
  premier succès, conformément à la règle qu'il décrivait déjà par
  anticipation.

- **✅ Le dashboard affirmait « Active » sur une campagne que plus personne ne
  pouvait jouer (2026-07-31)** — `status` est un état STOCKÉ, la jouabilité
  est un état DÉRIVÉ (`status` + fenêtre `starts_at`/`ends_at`). `/play`
  calculait le dérivé, le dashboard n'affichait que le stocké : une campagne
  dont la date de fin était passée restait « Active » en vert, sans bannière,
  pendant que tout client qui scannait lisait « Cette campagne est
  terminée ». Divergence STRUCTURELLE : le seul pont, `run_campaign_schedule()`,
  ne bascule que les campagnes `auto_schedule = true`, et les dix modèles de
  la galerie posent `auto_schedule: false` en dur — « Boost du weekend » (3
  jours) rend le défaut visible vite. Prédicat extrait et partagé
  (`lib/campaign-window.ts`), les deux bornes couvertes (une campagne activée
  avec un `starts_at` futur affichait la même pastille verte, dit maintenant
  « Programmée »). Bannière ajoutée avec la date et les deux issues
  possibles : repousser, ou archiver.

  **Même jour, même écran — la checklist d'accueil.** Un membre « éditeur »
  cliquait « Ajouter votre logo » et retombait sur `/dashboard` sans un mot —
  `/dashboard/settings` est réservé au propriétaire. La checklist restait
  bloquée à 5/6, reclic après reclic. Résidu exact de la PR #66 (corrigée
  pour les quatre bandeaux d'abonnement, pas pour `dashboard/page.tsx`).
  L'étape est **retirée** pour un non-propriétaire (pas grisée : la checklist
  promet de disparaître à 100 %, une étape à jamais impossible casse ce
  contrat), dénominateur ajusté en conséquence.

- **✅ Quatre gestes d'entretien qui coinçaient un humain (2026-07-31)** —
  même classe que la suppression de session (voir plus bas) : un geste banal
  du commerçant détruit, en silence et au premier clic, quelque chose qu'un
  client tient déjà dans la main. Aucune cascade retirée (donnerait un
  `23503` opaque) : on COMPTE ce qui serait perdu, on refuse tant qu'une
  confirmation n'est pas cochée, et le refus NOMME le nombre.
  - **Calendrier** — ramener 24 cases à 15 supprimait les cases 16-24 et,
    par cascade, les ouvertures des joueurs : les codes `CADEAU` distribués
    n'existaient plus, alors que le texte d'aide promettait l'inverse
    (« le contenu déjà saisi est conservé » — corrigé aussi).
  - **Événement live** — corriger une coquille dans une question effaçait
    toutes les réponses déjà données (`delete`+`insert`) : le dévoilement ne
    trouvait plus rien, le classement ne bougeait pas, les codes `EVENT`
    partaient à la clôture sur un classement faux. Le `delete`+`insert` n'a
    plus lieu que si le NOMBRE d'options change ; à nombre égal, `update`
    ciblé par id (les réponses survivent). Si le nombre change et que des
    réponses existent : refus avant toute écriture.
  - **Chasse au trésor** — le SQL n'est pas l'impasse
    (`record_hunt_scan` complète même sur un re-tampon) : c'est l'ÉCRAN qui
    fermait la porte, `hunt-journey` calculant `complete` dès le chargement
    (4 ≥ 4) et n'affichant donc plus le bouton qui débloquerait le serveur —
    le joueur voyait une carte de victoire VIDE. Les deux bouts traités :
    refus informé nommant les joueurs en cours (voir aussi l'entrée ÉLEVÉ
    ci-dessus), solde automatique après suppression.
  - **Équipe** — le rôle d'un collègue était inchangeable : ni bouton, ni
    action, ni policy (`organization_members` n'accorde à `authenticated`
    que `select` et `delete`). Le contournement tenté par tous — ré-inviter
    avec le nouveau rôle — ne faisait RIEN (`accept_team_invitation` porte
    `on conflict do nothing`). Nouvelle RPC `set_team_member_role` (owner
    seul, cible bornée, refus de dégrader le dernier owner), sélecteur par
    membre. `accept_team_invitation` volontairement NON redéfinie (sept
    corps d'archive périmés recensés dans la migration — réécrire depuis
    00015 est un piège déjà payé deux fois par ce projet).

  **CLOS (2026-08-01, PR #78)** : voir l'entrée dédiée ci-dessous — les
  invitations en vol ne sont plus silencieuses, elles sont révoquées à la
  réinvitation.

- **✅ Deux invitations vivantes pour la même adresse, et deux libellés
  permutés qui réécrivaient le sens des réponses données (2026-08-01,
  PR #78)** — les deux derniers résidus de la liste ouverte, dont un vrai
  défaut.

  **Invitations en vol.** `team_invitations` ne porte aucune unicité sur
  (organisation, e-mail), et `inviteTeamMember` faisait un `insert` simple.
  Le geste naturel du propriétaire qui s'est trompé de rôle est de
  RÉINVITER — la personne n'étant pas encore membre, la garde « fait déjà
  partie de l'équipe » ne la protège pas. Le collègue recevait alors deux
  e-mails, deux jetons valides, deux rôles ; en ouvrant le PLUS ANCIEN —
  souvent le plus haut dans sa boîte — il entrait avec le rôle que le
  propriétaire venait précisément de corriger. `revoked_at` existait déjà et
  le chemin d'acceptation le contrôle (« invitation annulée », migration
  00015), le bouton de révocation manuelle l'écrit : **le mécanisme était
  là, rien ne l'appelait sur ce chemin**. Réinviter appelle désormais ce
  chemin — les invitations non acceptées et non révoquées de la même adresse
  sont révoquées avant l'envoi de la nouvelle. L'échec de révocation
  n'interrompt pas l'envoi (deux invitations valent mieux qu'aucune), et il
  est journalisé.

  **Permuter deux libellés réécrit le sens des réponses déjà données.** Une
  réponse enregistrée désigne un BOUTON, pas un texte. Le gel du libellé
  livré plus tôt (voir « Le libellé d'un lot émis est figé » plus haut, même
  logique appliquée aux questions d'événement) protège la vérité de la
  question (`is_correct`, `question_type`) et laisse le libellé modifiable —
  c'était son objet, corriger une coquille en pleine soirée sans perdre les
  réponses (« Événement live », plus haut). Mais permuter deux libellés
  laisse les quarante réponses en place et change ce qu'elles veulent dire :
  ces joueurs se retrouvent crédités de l'autre choix. `updateEventQuestion`
  refuse désormais toute réécriture d'options qui laisse l'ENSEMBLE des
  libellés identique (triés) mais change leur ORDRE ou leur affectation aux
  réponses déjà enregistrées, tant que des réponses existent.

  **Trois erreurs de méthode, consignées parce qu'elles sont l'essentiel** :
  1. Le premier geste était trop large — toute modification de libellé était
     taxée, donc aussi la correction de coquille que le chantier précédent
     avait délibérément rendue gratuite. Trois tests existants l'ont dit
     immédiatement. La bonne distinction est une MESURE, pas une intention :
     une permutation laisse l'ensemble des libellés identique, une coquille
     corrigée le modifie — on compare les libellés triés.
  2. La première rédaction du refus se terminait par « Cochez la case de
     confirmation… », qui EST le marqueur de la suppression de session dans
     le MÊME écran : la case parlant de codes de retrait serait apparue sous
     un refus parlant de réponses. Marqueur distinct retenu, verrouillé dans
     les deux sens par un test.
  3. Cette garde a d'abord été inscrite dans le registre des quatre gardes
     de suppression (`destructive-confirm-coverage.test.ts`) ; trois de ses
     assertions sont tombées, et elles avaient raison — ce registre asserte
     que quatre marqueurs de SUPPRESSION disent la même chose, or celui-ci
     ne détruit rien et doit précisément DIFFÉRER. Fichier de garde séparé
     (`src/lib/answer-meaning-guard.test.ts`), motif écrit en tête. Une seule
     assertion du registre voisin a été corrigée à cette occasion : elle
     exigeait la forme exacte `import { X } from "…"` sur une seule ligne et
     tombait sur un simple passage en multi-lignes — une garde qui rougit
     sur un retour à la ligne apprend à être contournée.

  **Assumé, et dit explicitement** : les navigateurs Playwright n'ont pas
  été installés sur Windows pour forcer la reproduction du flaky de la
  caisse (voir plus bas) — un demi-gigaoctet pour reproduire une course
  côté test dont l'impact produit est réfuté sur les trois étages, alors que
  le test est instrumenté pour répondre lui-même au prochain passage.

  Preuve : 124 fichiers / 2 007 tests, typecheck 0, lint 0. Six sabotages
  joués avec témoin, dont un qui rejoue le geste trop large et fait tomber
  les quatre tests protégeant la correction de coquille. PR #78.

- **✅ Le coût d'un lot ne se saisissait qu'au second temps (2026-07-31)** —
  `addPrizeSchema` acceptait déjà `cost_cents`/`value_cents` (il étend
  `prizeFieldsSchema`, où les deux sont facultatifs) ; seule la lecture du
  `FormData` à la création les oubliait, alors qu'`updatePrize` les lit vingt
  lignes plus bas. Tout lot naissait à `null`, et le coût ne se renseignait
  qu'en rouvrant le lot dans le formulaire de modification. Pas cosmétique :
  `claim_winning_spin` impute `budget_spent_cents += coalesce(p.cost_cents,
  0)` — un commerçant posant un plafond de dépense sans repasser sur chaque
  lot lisait « 0 € dépensés sur 250 € » indéfiniment. Champ resté FACULTATIF
  (un vide ne veut pas dire zéro) ; un montant illisible est refusé plutôt que
  retombé silencieusement sur `null`.

- **✅ Le 404 du panel envoyait chercher une cause inexistante (2026-07-31)** —
  sept pages de module (calendar, hunts, quiz, events, pronostics, jackpot,
  loyalty) appellent `notFound()` quand l'abonnement ne couvre plus le
  module. Le commerçant dont l'essai vient d'expirer ouvrait son favori et
  lisait qu'il fallait « vérifier le sélecteur d'organisation » — on
  l'envoyait chercher une cause inexistante, alors que la page existe, lui
  appartient, et n'est fermée que par l'abonnement. La coupure elle-même
  n'est PAS un défaut (délibérée, documentée cinq fois dans
  `docs/decisions.md`, verrouillée par `subscription.test.ts:41`, aucune
  perte de données — voir la réfutation en tête de cette section) : seul le
  message change. Le lien « Voir mon abonnement » n'est montré qu'au
  propriétaire (l'y envoyer pour un autre rôle aurait reproduit, dans le
  correctif même, le défaut de la checklist d'accueil ci-dessus).

- **✅ Supprimer une session d'événement live emportait les lots non retirés
  (2026-07-31)** — `event_wins` cascade depuis `event_sessions`. Le bouton
  « Supprimer la session » partait au premier clic, sans confirmation, alors
  que la suppression du JEU dans le même écran en demande une depuis
  toujours — ce contraste interne a permis de trancher. Le commerçant fait
  le ménage le lendemain de sa soirée : les codes `EVENT-` distribués à la
  clôture disparaissaient avec la session, tout gagnant pas encore passé en
  caisse se voyait refuser un lot réellement obtenu. Cascade non touchée
  (donnerait un `23503` opaque) : refus tant qu'un lot attend, le refus NOMME
  le nombre, la confirmation n'apparaît qu'une fois le coût connu.

- **✅ CHASSE AUX BUGS PAR PARCOURS VÉCU — 33 trouvailles, 14 confirmées,
  9 corrigées (2026-07-31)** — après quatre jours de campagnes de mesure, le
  client a tranché : *« il ne doit rester aucun bug sur le site et
  l'expérience avant de continuer à développer »*. La chasse a donc été
  organisée par PARCOURS — le joueur qui scanne, les 19 autres jeux, les
  modules autonomes, la caisse, le socle commerçant, les éditeurs, l'équipe
  et l'abonnement, le transverse — et non par fichier.

  **Règle d'admission** : un défaut ne comptait que si l'on pouvait écrire
  « il fait X, il attend Y, il obtient Z » avec des gestes concrets. Les
  tests, la doc, le style et l'architecture étaient explicitement hors sujet.

  **CE QUI BLOQUAIT LE JOUEUR** (le plus fréquent d'abord) :

  1. **Le contrôle anti-robot sans porte de sortie.** `TurnstileWidget`
     énonce la règle dans son propre commentaire — « un appelant qui
     CONDITIONNE une action au jeton doit s'abonner à `onUnavailable` […]
     sans cela le client reste devant un cadre vide ». Trois modules l'avaient
     fait ; **le parcours principal, la roue, ne l'avait pas**, ni les 19
     autres jeux. Le joueur appuyait, lisait « Merci de valider la
     vérification », et cherchait un contrôle absent. Un bloqueur de
     publicités, un DNS filtrant ou un Wi-Fi de commerce suffisent : la
     situation ordinaire d'un client dans une boutique. → `TurnstileGate`,
     extrait plutôt que recopié six fois.

  2. **Quatre écrans qui meurent sur une coupure réseau.** Un drapeau de garde
     resté coincé, et l'écran ne répond plus jamais : `spinningRef` sur la
     roue, `requestingRef` sur les 8 jeux de révélation, `pending` sur les 6
     jeux de défi — celui-là mourait à l'instant précis où le joueur validait
     sa tentative. Et `claimPrize` sans `try/catch` : le gagnant restait sur
     « Enregistrement… » pour toujours, **alors que son lot était déjà
     décrémenté du stock**.

  3. **La carte à gratter affichait « Impossible de jouer » À LA PLACE du lot**
     que le joueur avait à montrer en caisse — elle n'avait reçu ni la garde
     `startedRef` ni la reprise `pendingWinRef` que `game-shell` porte depuis
     le 2026-07-29.

  **CE QUI MENTAIT À L'UTILISATEUR** :

  4. **La caisse ne distinguait pas « vous venez de le remettre » de « il l'a
     déjà eu ».** Même texte ambre, même icône d'avertissement. Le caissier
     qui reprend le poste lisait un refus sur une remise qu'il venait
     d'autoriser, et hésitait à donner le lot devant le client. *Vérifié dans
     l'historique : `state` n'a jamais servi qu'aux erreurs — le défaut
     préexiste au rechargement franc ajouté le matin même.*

  5. **Trois textes disaient trois choses de l'expiration.** Le réglage
     s'appelle « Compte à rebours avant masquage » — il ne masque pas, il
     ARME `redeem_expires_at`, et la caisse refuse ensuite. L'écran renvoyait
     le gagnant vers son email, l'email ne disait pas jusqu'à quand, et le
     commerçant ne savait pas qu'il l'avait décidé.

  6. **Le calendrier promettait un cadeau qui n'a jamais existé.**
     `completion_reward_label` vaut `''` à la création — le réglage PAR
     DÉFAUT. Le joueur qui ouvrait toutes ses cases lisait « Cadeau
     momentanément épuisé, présentez-vous au comptoir » et se déplaçait pour
     rien. Aucune migration : l'absence de libellé EST le signal.

  7. **La chasse au trésor rendait une carte de victoire VIDE.** Terminée sur
     stock épuisé, le joueur voyait « Trésor épuisé » une fois — puis, au
     moindre rechargement, plus rien : ni code, ni message. `huntFull` ne
     vivait que dans l'état client du dernier scan, tandis que `complete` est
     recalculé au serveur et restait vrai.

  8. **Supprimer une campagne détruisait les codes gagnés non retirés.**
     `participations.campaign_id` porte `on delete cascade` (00001:99) :
     le client arrivait au comptoir avec son email et s'entendait répondre
     « code introuvable » — un engagement annulé sans que personne, le
     commerçant compris, ne l'ait décidé. La cascade n'est PAS touchée (la
     retirer donnerait un 23503 opaque) : l'action refuse tant qu'une
     confirmation n'est pas cochée, et **le refus NOMME le nombre de lots**.

- **✅ Le libellé d'un lot émis est figé — ET MA PREUVE DE LA VEILLE ÉTAIT
  FAUSSE (2026-07-31)** — le commerçant qui renommait sa récompense
  réécrivait le nom de tous les lots déjà gagnés et pas encore retirés :
  `upsert_reward_issuance` faisait `label = excluded.label` à chaque
  synchronisation. Le client arrive avec un email qui annonce « Café offert »,
  la caisse affiche « Croissant offert », et rien ne dit lequel fait foi.

  **L'aller-retour vaut d'être consigné.** J'ai écrit ce correctif, je n'ai
  pas su démontrer son effet, et je l'ai RETIRÉ en notant la question
  ouverte : *« le registre est-il seulement alimenté pour les
  participations ? »*. La réponse est oui. Mon test cherchait
  `source_type = 'participation'` alors que la branche participations de
  `sync_reward_issuance` écrit **`'wheel'`**. Aucune ligne ne pouvait
  apparaître : c'était la preuve qui était fausse, pas le mécanisme.

  *Retirer sur une preuve défaillante est moins grave que livrer sans preuve
  — mais c'est la même erreur de méthode, et elle a coûté un aller-retour.*

  **Mesuré, avec contrôle négatif** : à l'émission « Café offert E2E » ;
  après renommage avec le gel, « Café offert E2E » ; **sans** le gel,
  « RENOMMÉ SANS GEL ». Sans ce contrôle, un libellé qui ne bouge pas ne
  dirait rien — peut-être que rien ne le fait bouger.

  **Les gardes de la migration ont servi dès le premier essai** : elle visait
  `sync_reward_issuance`, alors que le motif vit dans
  `upsert_reward_issuance`. Elle a refusé de s'appliquer au lieu d'agir dans
  le vide. La migration se DÉRIVE du catalogue (`pg_get_functiondef` + une
  substitution) au lieu de recopier deux cents lignes qui divergeraient.

  **CLOS LE MÊME JOUR (PR #68)** : la caisse lit désormais le libellé gravé.
  Le registre était DÉJÀ interrogé pour router le code — il remonte aussi son
  nom, et la page le passe en prop aux neuf cartes. Pas neuf lectures de
  plus, donc pas neuf occasions d'en oublier une.

  **Le repli est la partie qui compte** : `frozenLabel` vaut `null` pour un
  code antérieur au registre, et pour une ligne rétro-alimentée au libellé
  vide. L'affichage retombe alors sur la table parente — l'ancien
  comportement, le meilleur disponible pour eux. Sans ce repli, le correctif
  rendait la caisse MUETTE sur tous les anciens lots. Un test le verrouille,
  et le contrôle négatif le distingue des deux autres : neutraliser la
  lecture fait tomber les deux tests de lecture, pas celui du repli.

- **✅ Quatre frottements du quotidien (2026-07-31)** — les trouvailles
  « mineures » de la chasse, celles qu'on ne signale jamais parce qu'on s'y
  habitue.

  · **La caisse ne repartait pas à vide.** Après une remise, le champ gardait
    le code précédent, curseur en fin de saisie. Le client suivant se
    présente, le caissier tape par-dessus, et la recherche part sur les DEUX
    codes collés bout à bout : « Code introuvable » devant quelqu'un qui a
    pourtant un vrai lot. Un lien « ↺ Client suivant », **sans JavaScript** —
    la caisse doit marcher sur le téléphone d'appoint du commerce.

  · **Quatre bandeaux d'abonnement envoyaient les non-propriétaires dans le
    mur.** « S'abonner » et « Gérer l'abonnement » pointaient vers
    `/dashboard/settings`, qui renvoie tout non-propriétaire vers
    `/dashboard`, lequel renvoie un caissier vers `/dashboard/redeem`. Il
    retombait exactement là d'où il venait, bandeau identique, sans un mot.
    Le lien n'est plus montré qu'à qui peut s'en servir.

  · **Les probabilités affichées ignoraient le stock épuisé.** Le moteur
    exclut du tirage tout lot gagnant à zéro ; l'éditeur le comptait encore
    dans le poids total. Le lot épuisé gardait son « ~40 % » et **tous les
    autres apparaissaient sous leur chance réelle** — le commerçant
    recalibrait ses poids sur une distribution qui n'existait plus.
- **Quatre fonctions SQL inappelables — `pg_catalog.coalesce`/`greatest`/`least`
  (ÉLEVÉ, récidive)** — trouvé/résolu 2026-07-26 (`4c6a010`). `COALESCE`,
  `GREATEST`, `LEAST` et `NULLIF` sont des constructions du parseur
  (`CoalesceExpr`/`MinMaxExpr`/`NullIfExpr`), sans entrée `pg_proc` : les
  qualifier en `pg_catalog.` produit « function pg_catalog.coalesce(…) does
  not exist » **à l'exécution**, alors que le DDL de la migration s'applique
  sans erreur — pire qu'un échec de migration, un défaut invisible jusqu'au
  premier appel. Touchait `security_equity` et les trois migrations de
  méta-progression (6 occurrences). **Récidive** : le projet s'était déjà
  fait prendre deux fois par la même classe d'erreur
  (`20260721190000_fix_nullif_qualification`,
  `20260728130000_fix_calendar_join_nullif`). Garde CI ajoutée (`81a521e`,
  `scripts/check-sql-parser-constructs.mjs`), placée avant `supabase start`
  car statique — troisième occurrence, elle ne se reproduira plus sans faire
  échouer la CI immédiatement.
- **Référence ambiguë dans `resolve_player_identity` (ÉLEVÉ)** —
  trouvé/résolu 2026-07-26 (`c0d5549`). `returns table (player_id uuid, …)`
  fait des colonnes de sortie des variables OUT en scope dans tout le corps ;
  deux clauses `on conflict` portant `player_id` ne peuvent pas être
  qualifiées (syntaxe interdite), donc leur `player_id` désignait à la fois
  la colonne et la variable OUT homonyme — « column reference "player_id" is
  ambiguous » à l'exécution. Toute résolution d'identité joueur était cassée
  dès le premier appel. Corrigé par `#variable_conflict use_column`, même
  classe de correctif que `20260724130000` (create/join_contest_league).
- **Le registre universel des récompenses violait ses propres CHECK
  (ÉLEVÉ)** — trouvé/résolu 2026-07-26 (`573c724`). `mirror_reward_issuance`
  est un trigger AFTER INSERT/UPDATE sur 10 tables legacy, donc exécuté DANS
  la transaction de l'écriture d'origine : une contrainte plus stricte dans
  le miroir que sur la table source lui donnait de fait un **droit de veto
  sur l'autorité** — un code accepté par `participations` (colonne `text
  unique`, aucun CHECK) aurait fait ROLLBACK le tour de roue réel. Bloquait
  le seed de données, donc TOUS les E2E. Arbitrage : la contrainte du miroir
  était trop stricte, pas la source menteuse — `code_shape` élargie,
  contrainte `expiry_order` supprimée, rien normalisé côté source.
- **`apply_stripe_subscription_event_v2` rendait deux lignes pour un même
  événement (MOYEN)** — trouvé/résolu 2026-07-26 (`4e899c7`). `return query`
  ajoute au jeu de résultats sans interrompre la fonction : un événement
  appliqué produisait sa ligne « appliqué » puis retombait sur la sortie
  « ancien ignoré », soit une seconde ligne annonçant `applied = false`. Le
  webhook lit `rows[0]` et tombait juste par simple ordre d'émission, qu'aucun
  `order by` ne garantit — c'est ce qui faisait tomber
  `subscription_entitlements.test.sql` depuis trois passages CI. **Non
  atteint en production** : elle tourne toujours sur la v1 (migration
  `00019`).
- **Pagination des items d'abonnement Stripe non gérée (MOYEN)** —
  trouvé/résolu 2026-07-26 (`03be9ea`). `subscriptions.retrieve` pagine
  `items` à 10 par défaut ; au-delà, `resolveStripeEntitlements` aurait
  **coupé des modules payés en silence** sur la photographie tronquée.
  Latent aujourd'hui (9 prix possibles au maximum), atteignable au premier
  prix ajouté. Le webhook échoue désormais en 500 avec alerte dédiée plutôt
  que d'appliquer un état faux, laissant Stripe retenter.
- **Harnais E2E Stripe désaligné sur la forme réelle de l'API (MOYEN,
  faux positif)** — trouvé/résolu 2026-07-26 (`3409544`). 5 tests
  échouaient ; diagnostic formel avant correctif : harnais, pas code. Le stub
  renvoyait un abonnement sans `items`, une forme que l'API Stripe ne produit
  jamais.
- **Suite `subscription_entitlements.test.sql` sans contexte d'appel
  (MOYEN, méthodologique)** — trouvé/résolu 2026-07-26 (`4ecf165`). Toute la
  première section de la suite s'exécutait sans rôle posé, révélée par le
  correctif de `4e899c7` : la garde d'autorisation plantait avant de rendre
  son verdict, masquant le vrai résultat. Assertion d'autorisation ajoutée ;
  les 21 autres suites balayées par prudence — 101 fonctions gardées
  recensées, aucune autre défaillante.
- **Bouton `danger` sous le seuil de contraste AA — global au produit
  (FAIBLE, a11y, préexistant)** — trouvé/résolu 2026-07-26 (`6973d13`).
  Blanc sur `bg-red-500` (#ef4444) ≈ 3,8:1, sous le seuil AA de 4,5:1. Trouvé
  par la trace Playwright d'un passage en échec sur `/dashboard/progression`
  (page publiée grâce à `a3e135a`) — trois passages avaient été dépensés à
  deviner un problème de sélecteur ou de délai avant que la trace ne donne la
  cause en une minute. Passé en `red-600` (~4,8:1), hover `red-700` ; défaut
  préexistant et global (admin, quiz, événement, campagnes), `/dashboard/progression`
  étant simplement la première page scannée par axe à porter des boutons de
  suppression. `text-zinc-500` remplacé par le jeton maison `text-k-body` au
  passage.

**Erreurs personnelles commises et corrigées pendant ce même durcissement**,
consignées ici parce qu'un correctif qui crée le défaut qu'il prétend
résoudre est un bug au même titre qu'un défaut de code :

- **`router.refresh()` créait le blocage qu'il prétendait résoudre** —
  introduit `15364ee`, annulé `c131340` (2026-07-26). Diagnostic initial :
  un commerçant crée une saison, le formulaire se ferme (l'action a réussi)
  mais la liste affiche « Aucune saison pour l'instant » — un défaut de
  rafraîchissement, corrigé par l'ajout de `router.refresh()` dans la
  transition. Faux : appelé dans `startTransition`, `router.refresh()`
  maintient `pending` vrai jusqu'au rendu serveur complet et réinitialise au
  passage les champs non contrôlés du formulaire suivant — bouton figé sur
  « Enregistrement… », saisie perdue, création impossible. Établi en
  rejouant le parcours **en local contre un vrai Postgres et un vrai
  navigateur** (première fois du projet) : la trace montrait sans ambiguïté
  le formulaire vidé. Le message de commit de `15364ee` affirmait un
  diagnostic qui ne tenait pas.
- **Sur-généralisation des sélecteurs E2E à quatre noms sur la preuve d'un
  seul** — introduit `602d4eb`, corrigé `20ff8e8` (2026-07-26). La preuve de
  markup ne couvrait qu'UN nom sur quatre partageant leur `<p>` avec leur
  pastille d'état (mission et coffre) ; l'égalité stricte avait été appliquée
  aux quatre sans vérifier individuellement chaque cas.

- **Addon Parrainage inactivable pour TOUT commerçant — 2 addons absents du
  back-office (ÉLEVÉ, défaut de PRODUCTION)** — trouvé/résolu 2026-07-25
  (`b483740`). La base portait **8 addons** (`addon_pronostics`, `addon_hunts`,
  `addon_loyalty`, `addon_jackpot`, `addon_events`, `addon_calendar`,
  `addon_referral`, `addon_quiz`) mais la fiche commerçant du back-office n'en
  exposait que **6**, et `src/lib/admin/data.ts` ne **lisait** même pas les deux
  manquantes. Conséquence réelle : le module **Parrainage ludique, en production
  depuis plusieurs jours (V1.12), ne pouvait être activé pour AUCUN commerçant** —
  la fonctionnalité était livrée et inatteignable. `getUserAndOrg` sélectionnait
  déjà les 8 colonnes : le blocage venait bien du back-office, pas d'un select
  incomplet. **Fix** : les 2 colonnes ajoutées au type et au select de
  `admin/data.ts`, 2 bascules ajoutées à la fiche commerçant (« Addon Parrainage
  ludique », « Addon Quiz ») via la mécanique partagée existante (audit
  `logAdminAction`, `revalidatePath`) — aucune ligne des 6 bascules existantes
  modifiée. Résidu noté : `setMerchantCompAccess` (accès offert) ne couvre que
  4 addons — incohérence préexistante, les bascules dédiées y suppléent (suivi en
  Low Priority).
- **Roue publique 100 % en échec (« Une erreur est survenue »)** —
  découvert 2026-07-20, corrigé le jour même (`20260720150500`).
  `perform_atomic_spin` référençait `is_losing` sans alias dans la somme
  des poids : collision avec la colonne homonyme du `returns table` →
  erreur PostgreSQL 42702 à chaque tirage depuis la migration 00019. La
  page /play restait affichable (ISR) mais tout spin échouait. Détection
  impossible par la CI d'alors : aucun test n'exécutait le tirage —
  ajout d'un test pgTAP qui appelle réellement la RPC (lives_ok + une
  ligne exacte). Audit des autres fonctions `returns table` : aucune
  autre occurrence.

- **Codes `CHASSE-…` non remboursables en caisse (saisie manuelle)** —
  trouvé/résolu 2026-07-22 (`e1dea3a`). `lookupRedeemCode` tentait le flux
  roue en premier : `normalizeRedeemCode` renvoie une valeur non vide pour
  quasiment toute saisie (elle préfixe de force en `GAIN-`), donc la
  branche roue interceptait tous les codes et son `return null` rendait la
  branche chasse morte — aucun `CHASSE-…` n'était remboursable (régression
  introduite en `34496e8`). Routage réécrit PAR TYPE : chasse d'abord
  (`normalizeHuntCode` strict, rejette les `GAIN-`), roue en repli ; un
  préfixe `CHASSE` explicite fait autorité (jamais de repli roue). 9 tests
  de routage ajoutés (`participations.test.ts`).
- **Codes `CHASSE-…` non remboursables en caisse (scanner caméra)** —
  trouvé/résolu 2026-07-22 (`46d8868`). Même cause côté client : le scanner
  pré-normalisait tout QR décodé via `normalizeRedeemCode`, transformant
  `CHASSE-ABCD2345` en `GAIN-CHASSE-ABCD2345`. Le payload d'un QR/pass porte
  déjà son préfixe : il est désormais transmis TEL QUEL à `/dashboard/redeem`,
  le routage et la normalisation étant faits côté serveur (`e1dea3a`).
- **Claim de chasse réutilisable → email-bombing (ÉLEVÉ)** — trouvé/résolu
  2026-07-22 (revue sécurité, `88db5bc`). `claimHuntReward` acceptait un
  email à chaque appel sur une chasse déjà terminée → envoi Resend en
  boucle depuis le domaine du commerçant + empoisonnement de sa newsletter
  avec un destinataire arbitraire. Attache-email rendue à usage unique
  (compare-and-swap atomique `email is null` + `.select()`) : seul le
  premier email déclenche envoi et abonnement, les rappels suivants sont des
  no-op. Voir ADR-024.
- **Rate-limit de scan trop agressif pour IP partagée (MOYEN)** —
  trouvé/résolu 2026-07-22 (revue sécurité, `88db5bc`). `huntScanIp` était
  calibré à 20/600 s : une galerie marchande ou un festival (nombreux
  joueurs derrière un même NAT) aurait été verrouillé. Plafond porté à
  200/600 s ; la sécurité du scan repose sur l'entropie des jetons (≈ 2⁸⁰)
  et le seau par cookie joueur, pas sur le seau IP (fail-closed conservé,
  repli SQL). Voir ADR-025.
- **CHECK du jeton d'étape resserré à 16 caractères** — trouvé/résolu
  2026-07-22 (`60ac904`). La contrainte SQL `hunt_steps.token` tolérait
  8 caractères alors que `createHuntStep` génère `randomCode(16)` ;
  bornée à `^[A-Za-z0-9-]{16,64}$` (défense en profondeur), seed E2E,
  fixtures pgTAP et `huntStepTokenSchema` alignés sur 16 (`10242e7`).
- **`newsletter.subscriber.created` non émis au claim de chasse** —
  trouvé/résolu 2026-07-22 (`10242e7`). Le claim de chasse émet désormais
  le webhook sortant via l'outbox `webhook_deliveries` (parité avec la roue),
  uniquement à la création d'un nouvel abonné (jamais sur le no-op à usage
  unique), best-effort et gaté sur `webhook_url`.

### Passeport de fidélité — durcissement pré-GA (2026-07-22 → 2026-07-23)

Le module est passé en production en qualité **GA** après **8 revues de
sécurité successives**. Historique honnête : plusieurs correctifs ont chacun
révélé un défaut sous le précédent (commits `5a4e1de`→`5ba06a1`).

- **QR passeport = bearer 180 j en mode staff → jeton de check-in signé
  (MOYEN)** — trouvé/résolu 2026-07-22 (`51d4238`, `8d08817`). En mode `staff`,
  le QR affiché au joueur encodait la valeur du cookie passeport (un bearer de
  180 j) : quiconque le photographiait (client voisin, caissier) pouvait reposer
  le cookie, LIRE les codes `FIDELITE-…` non remis et consommer les tours de
  roue offerts de la victime. Remplacé par un **jeton de check-in HMAC, TTL
  3 min** (`src/lib/loyalty-checkin.ts`) qui n'autorise QUE la validation d'une
  visite par un staff authentifié et ne porte que le HASH du jeton passeport —
  un QR photographié est inerte après 3 min et ne donne accès à aucune lecture.
  Voir ADR-030.
- **Rejeu du jeton de check-in dans sa fenêtre → planchers de cooldown durcis
  (MOYEN)** — trouvé/résolu 2026-07-22 (`a1d18e0`, `f635a17`, `8d08817`,
  `e4be444`). Un jeton de check-in (ou un code tournant) lu une fois pouvait
  valoir 2 tampons s'il était rejoué avant la bascule de fenêtre. Planchers de
  cooldown posés EN BASE (`loyalty_programs_cooldown_floor_check`) : 300 s en
  mode `staff` (TTL du jeton + marge) et `max(2 × période, 300 s)` en mode
  `rotating_code`, de sorte que la durée de validité d'un code soit TOUJOURS
  couverte par le cooldown. Un code lu une fois ne vaut donc jamais 2 tampons.
  Voir ADR-030.
- **Seaux « kill-switch » anti-devinage → 3 DoS avant fermeture par clé
  d'identité (MOYEN, méta-bug)** — trouvé/résolu 2026-07-22 (`f7d1c44`,
  `ee34919`, `6a3890a`, `178bf42`). Le durcissement anti-devinage du code
  tournant a d'abord posé un seau d'échecs `failClosed` sur une clé PARTAGÉE
  (IP / programme) : trois itérations successives ont chacune recréé un
  interrupteur de déni de service (n'importe qui derrière le même Wi-Fi de
  commerce ou le même CGNAT coupait le service pour tous). Fermé en changeant de
  QUESTION — on ne borne plus la devinette du code mais la CRÉATION d'identités
  (clé propre), puis on retire les seaux kill-switch. Généralisé en règle
  transverse : ADR-032.
- **Frappe de masse de passeports → fermée par les verrous économiques
  (structurel)** — trouvé/résolu 2026-07-22 (`6180c8c`). Aucun empilement de
  rate limits ne fermait la boucle (identité anonyme et gratuite → valeur
  encaissable) : un seau borne un débit, jamais une boucle. Bornée par
  l'ÉCONOMIE : **stock fini obligatoire** sur tout palier + **palier ≥ visite 2**
  (un passeport fraîchement créé ne vaut rien). La perte maximale d'un programme
  vaut alors exactement le stock choisi par le commerçant, quel que soit le
  nombre de passeports fabriqués (≈ 150 € pour une configuration type). Voir
  ADR-031.
- **Palier `spin` non borné (stock délégué à tort à la roue) → stock fini aussi
  sur spin (ÉLEVÉ)** — trouvé/résolu 2026-07-22 (`1b1c146`, `eef4ffc`). Le
  premier verrou économique n'imputait le stock qu'aux paliers `lot` et
  INTERDISAIT le stock sur un palier `spin`, sur la prémisse (fausse) que « le
  tour offert consomme le stock des lots de la roue ». Or un lot de roue est
  illimité par défaut (`prizes.stock` null) : un palier `spin` était, en
  configuration par défaut, une fabrique de codes `GAIN-…` sans aucune borne (et
  face à une roue à stock fini, il vidait le stock de la campagne principale).
  Fermé en trois portes : (1) **stock fini obligatoire aussi sur spin** (il
  compte les GRANTS émis) ; (2) un tour offert n'est **jamais tiré sur un lot à
  stock illimité** (exclu du tirage → `no_prize`, grant non consommé) ;
  (3) `consume_loyalty_spin_grant` **vérifie le statut, les dates et le créneau
  de la campagne** ciblée (portes que la roue publique passe déjà). Voir ADR-031.
- **`select("*")` de la page éditeur (aurait 404 en prod) (FAIBLE)** —
  trouvé/résolu 2026-07-22 (`7268821`). La page éditeur de programme
  sélectionnait `*` sur `loyalty_programs`, dont le secret du code tournant
  n'est pas exposé aux grants `authenticated` : le `select("*")` aurait été
  refusé en production → 404. Remplacé par une liste de colonnes explicite.
- **Action Turnstile erronée sur la récupération pronostics (FAIBLE)** —
  trouvé/résolu 2026-07-22 (`635acc9`). Un alignement de plancher a
  incidemment révélé que la récupération d'identité Pronostics envoyait une
  action Turnstile erronée ; corrigée au passage (hors module, détectée
  pendant le chantier).
- **Contraste des paliers/tampons non atteints sous le seuil AA (FAIBLE,
  a11y)** — trouvé/résolu 2026-07-23 (`5ba06a1`). Les paliers et tampons encore
  verrouillés du passeport joueur s'affichaient sous le ratio de contraste
  WCAG AA ; contraste relevé.

### Jackpot collectif — revue sécurité pré-prod (2026-07-23)

Le module est prêt pour la production après revue sécurité, deux bloquants
corrigés et vérifiés (commits `45f704c`, `624224f`).

- **Code du gagnant fuité au déclencheur du seuil (CRITIQUE-1)** —
  trouvé/résolu 2026-07-23 (`45f704c` défense en profondeur, `624224f` fix SQL).
  En `threshold_draw`, le gagnant est tiré parmi TOUS les participants du cycle :
  `record_jackpot_participation` renvoyait le code `JACKPOT-…` INCONDITIONNELLEMENT
  → un joueur qui franchissait le seuil sans être tiré recevait le code du vrai
  gagnant et pouvait rembourser le lot en caisse à sa place (vol de lot).
  Fermé sur deux couches : (1) SQL —
  `'code', case when v_is_winner then v_win_code else null end` ; (2) app —
  `mapJackpotParticipation` force `code: isWinner ? … : null`, pour qu'une future
  régression ne puisse pas re-fuiter le code. `rescan_win` inchangé (gagnant =
  appelant). Le vrai gagnant récupère son code via la page publique
  (`jackpot_wins` filtré sur `winner_token_hash`). Tests pgTAP (sections 12-13)
  et Vitest de non-régression ajoutés. Voir ADR-033.
- **`date_draw` re-tirait à chaque cron (ÉLEVÉ-1)** — trouvé/résolu 2026-07-23
  (`624224f`). `run_jackpot_date_draws` rouvrait un cycle (`cycle + 1`,
  `current_count = 0`) après un tirage à date en laissant `draw_at` passé et
  `status = 'active'` → un nouveau tirage repartait au cron suivant dès qu'un
  joueur scannait, souvent parmi 1 seul participant (re-gain en heures creuses).
  La clôture est désormais ONE-SHOT (`reward_claimed_count + 1` seul) : le gain
  reste sur le cycle courant, que le garde `not exists jackpot_wins (…cycle…)`
  exclut définitivement. Campagne laissée `active` (non archivée) pour que le
  gagnant asynchrone récupère son code sur la page publique. Voir ADR-033.

## High Priority

### ✅ CLOS le 2026-08-05 (PR #115) — corrigé AU SCHÉMA pour un premier cas ; « l'audit a fermé la classe » était FAUX

`entierOptionnel` et `reference` tolèrent désormais `null`, alignés sur leurs
pairs de `src/lib/validations` (`codeTtlDaysSchema`). **La normalisation locale
a été supprimée, pas doublée** : deux mécanismes pour une règle, c'est celui
qu'on lit contre celui qui décide.

**⚠️ Correction (2026-08-06) : l'affirmation « aucun autre cas atteignable
n'existe » ci-dessous était fausse, sur deux points.** Elle disait
`tiebreakerNumberSchema` « portait déjà cette tolérance » — faux : `null` y
devenait silencieusement `0`. Et l'audit ne comptait que les **rejets**
(mode bruyant, Zod qui refuse `null`) ; il ne cherchait pas le mode
**silencieux** — `z.coerce.number()` sans `.nullable()` convertit `null` en `0`
(`Number(null) === 0`) sans lever d'erreur, donc sans qu'aucun grep sur les
messages d'erreur ne le trouve. La mesure réelle, faite en V1.41 : **26
violations, dont 23 silencieuses.** Voir l'entrée de fermeture de la classe
plus bas dans ce fichier et ADR-084.

**L'audit a réduit la classe au lieu de l'élargir — sur le seul mode qu'il
cherchait.** Je l'annonçais comme « ~50 interfaces à auditer » ; la mesure
disait : **131 des 362 lectures de `FormData` portent déjà un `??` ou un
`formData.has()`**, quatre cas théoriques ont un champ inconditionnel, et
« aucun autre cas atteignable » pour le mode bruyant — cette dernière clause
ne portait que sur le rejet, pas sur la conversion silencieuse.

**Le bon endroit est le schéma, et c'est le dépôt qui le démontre** : corriger
chez l'appelant a exigé un `??` sur 131 sites — **et en a quand même laissé
fuir un**. Les tests parsent le schéma directement, sans passer par l'action :
si quelqu'un retire la tolérance en croyant qu'un `??` la couvre ailleurs, ils
rougissent.

### ✅ CLOS le 2026-08-06 (branche `chantier/formulaires-null-classe`, ADR-084) — la classe est fermée par ses propriétés, pas par sa forme

Ce que l'entrée précédente annonçait « clos » ne l'était pas : elle comptait
les rejets, pas les conversions silencieuses. Mesure réelle : **26 violations
— 3 bruyantes, 23 silencieuses.** Le mode silencieux ne frappait que les
champs dont la borne basse descend à 0 : un `min(1)` refusait `null` **par
accident** (0 < 1) — la même faute était muette ou bruyante selon une borne
sans rapport avec elle. Les plus coûteuses : les trois cooldowns anti-rejeu
(chasse, fidélité, jackpot), où 0 est une valeur métier (« anti-partage
désactivé ») — un champ non rendu désarmait la protection en la faisant
passer pour un choix du commerçant ; et `weight` (`prizes.ts`), un lot de
poids 0 jamais tiré sans erreur.

Fermeture par point unique (`src/lib/validations/champ-formulaire.ts`, sept
primitives), 62 déclarations converties sur 12 modules, 98 `??` d'appelant
supprimés (5 survivent, chacun commenté). Verrou comportemental et non
textuel : `champ-formulaire-coverage.test.ts` vérifie deux invariants sur
300+ champs de 24 modules, sans jamais lire la forme du code.

**Risque résiduel assumé, non fermé par ce lot** : un champ **rendu** mais
**vidé** (`""`) vaut toujours 0 par coercition sur les entiers requis —
comportement d'origine, hors classe (le champ a été rendu), et le changer
refuserait des enregistrements aujourd'hui acceptés. Documenté dans
`nombreRequis`. Voir roadmap V1.41 et ADR-084.

### ⚠️ (historique) OUVERT (2026-08-05, MOYEN) — `entierOptionnel` rejette `null`, et `formData.get` en rend un pour tout champ non RENDU — fermé en V1.41, voir ci-dessus

`entierOptionnel` (`src/lib/validations/admin.ts`) est bâti sur
`z.string().default("")`, qui n'absorbe que `undefined`. Or `FormData.get`
renvoie **`null`** — pas `undefined` — quand le champ n'existe pas dans le DOM
soumis. Un formulaire qui n'affiche un champ que sous condition envoie donc
`null`, et la validation échoue sur `Invalid input: expected string, received
null`.

**Ce que ça a coûté, mesuré** : dans le panneau d'octrois du back-office, la
« durée » n'est rendue que pour un pass immédiat et le « délai » que pour un
pass différé. Conséquence — **aucun octroi `recurring` n'était créable depuis le
back-office**, ni aucun pass à activer plus tard. Le super-admin ne lisait qu'un
message de validation Zod brut. Corrigé le 2026-08-05 dans `grantMerchantModule`,
au seul endroit qui distingue « absent du DOM » de « laissé vide » : ses quatre
champs facultatifs sont normalisés, les quatre obligatoires restent bruts.

**Pourquoi l'entrée reste ouverte** : le correctif est **local à cette action**.
`entierOptionnel` rejette toujours `null`, et toute autre action lisant un champ
facultatif par `formData.get` porte le même défaut latent. **Non audité** — c'est
une classe, pas un cas, et la fermer demande de décider où corriger : dans le
schéma (`.nullable()` ou un `preprocess`) plutôt que chez chaque appelant.

### ✅ CLOS le 2026-08-05 (P0.5) — la garde a été levée, et les trois gestes sont faits

`venteEnLigneOuverte` ne refuse plus les `recurring-monthly`. Ce qui a été livré,
et qui ferme réellement le défaut décrit ci-dessous :
1. `partitionnerPrix` sépare les prix de pass des prix d'offre **avant** toute
   résolution — un abonnement de pass ne voit plus jamais
   `apply_stripe_subscription_event_v2`, donc ni le 500 ni le déclassement de
   plan ne sont atteignables ;
2. la révocation existe : sur statut `canceled`, l'octroi `recurring` de
   `(organisation, module, source='stripe')` est refermé ;
3. un **index unique partiel** interdit le cumul en base — décision produit du
   propriétaire, « un commerçant ne peut pas racheter un add-on mensuel déjà
   actif » —, ce qui rend la révocation non ambiguë sans persister
   l'identifiant d'abonnement Stripe.

Voir ADR-081. Le texte d'origine est conservé ci-dessous : il explique pourquoi
la correction évidente aurait été pire que le défaut, et ce raisonnement reste
vrai.

### 🔒 (historique) NEUTRALISÉ le 2026-08-05 (P0.4, ÉLEVÉ) — un add-on MENSUEL vendu en achat autonome casserait le webhook d'abonnement

**Le défaut n'est pas atteignable aujourd'hui** : `venteEnLigneOuverte`
(`src/lib/octroi-checkout.ts`) refuse les deux add-ons `recurring-monthly`
(« Passeport des habitués », « Bouche-à-oreille »), donc aucun abonnement de
pass ne peut naître. La ligne reste ici parce que la garde est **le contournement
d'un défaut réel**, pas sa correction : lever la garde sans faire le travail
ci-dessous rouvre le défaut en entier.

**Ce qui se passerait.** Un `mode: "subscription"` crée chez Stripe un abonnement
**séparé** de l'abonnement principal → `customer.subscription.created` →
`resolveStripeEntitlements` (`src/lib/stripe.ts:403`) ne connaît que les prix
d'offre et ceux d'`ADDON_PRICE_ENV` → un prix `STRIPE_PRICE_ID_PASS_*` sort en
`unknownPriceIds` → la route répond **500** (`webhook/route.ts:106`), en boucle,
puisque Stripe rejoue trois jours avant de désactiver le point d'entrée. La
synchronisation des **abonnements principaux** tomberait avec.

**Pourquoi la correction évidente est pire.** Ignorer ce prix ferait retomber
`resolveStripeEntitlements` sur `PLANS[0]` — l'offre la moins chère — et
`apply_stripe_subscription_event_v2` **écraserait le plan payé** de
l'organisation. Un 500 se voit dans les journaux ; un client déclassé en silence,
non.

**Seconde face, distincte.** Les termes d'un mensuel posent `ends_at: null`
(délibéré : une fin à trente jours couperait le module au premier
renouvellement) et **rien ne révoque** l'octroi à la résiliation — un add-on
résilié resterait ouvert indéfiniment. Le panneau d'administration cache
d'ailleurs le bouton de révocation pour `source = 'stripe'`
(`module-grants-panel.tsx:157`) : la révocation automatique est le chemin prévu,
et elle n'existe pas.

**Pour lever la garde, trois gestes et pas un** :
1. reconnaître un abonnement de pass **avant** `resolveStripeEntitlements` ;
2. ne pas le faire passer par la synchronisation d'abonnement ;
3. révoquer son octroi `recurring` sur `customer.subscription.deleted`.

Un test verrouille la garde : poser le prix en variable d'environnement ne
suffit **pas** à ouvrir la vente. Voir ADR-079.

### ✅ CLOS le 2026-08-05 (PR #111) — les clients serveur sont typés, 82 erreurs révélées et fermées

Le générique `<Database>` est posé sur `createAdminClient()` et `createClient()`.
Les 82 erreurs révélées se sont réparties en cinq gestes distincts — dont A1
(48 cas) corrigé **à la racine**, en un seul endroit, plutôt qu'en 48 points
d'appel. Les trois zones aveugles sont fermées : `runProgressionEditorRpc` est
générique sur `keyof Functions` (13 appels enfin vérifiés), `RESSOURCE_MODULE`
exige que `colonnePublication` soit une colonne réelle de sa table, et
`syncCalendarDays` insère un type de ligne.

**Angle mort résiduel, hors de notre portée** : un argument **optionnel** mal
orthographié avec un nom de fonction valide compile toujours — branche de
rétro-compatibilité de `postgrest-js`, qui retombe sur la dernière définition
portant ce nom. Les arguments **requis** manquants et les mauvais types sont
bien attrapés. Fermer ce dernier cas demanderait un type d'arguments exact
par-dessus la librairie.

### ⚠️ (historique) OUVERT (revue P0.4, INFO) — les deux clients Supabase **serveur** ne sont pas typés, donc aucun appel `.rpc()` n'est vérifié

`createAdminClient()` (`src/lib/supabase/admin.ts`) et `createClient()`
(`src/lib/supabase/server.ts`) appellent leur fabrique **sans le générique
`Database`**. Conséquence : `admin.rpc("n_importe_quoi", { p_faute_de_frappe: 1 })`
**compile**. Seul le client *navigateur* est typé (`createBrowserClient<Database>`) —
c'est-à-dire le moins privilégié des trois.

**Ce que ça a déjà coûté** : la CI de la PR #110 est tombée rouge au premier tour
parce que `activate_module_grant` manquait dans `database.generated.ts`. Rien en
local ne pouvait l'attraper — typecheck 0, lint 0, 3126 tests, build vert. Sur le
chemin d'un webhook de paiement, une faute de frappe de ce genre ne se verrait
qu'à l'exécution : un 500 **après** encaissement.

**Ampleur mesurée, et c'est pourquoi ce n'est pas corrigé dans P0.4** :
80 fichiers appellent `createAdminClient`, 116 appels `.rpc()` en dépendent.
Poser le générique ferait probablement rougir le typecheck en de nombreux points
— ce qui est précisément l'intérêt, mais c'est un chantier à part entière et non
un correctif glissé dans un lot de paiement.

### Chasse par parcours vécu (2026-08-02, branche `chantier/chasse-parcours`)

102 pistes examinées, 20 retenues, **19 confirmées et fermées, 1 réfutée**.
Le rapport de chasse — preuves, motifs de réfutation, gravités révisées — est
conservé tel quel dans `docs/chasse-parcours-2026-08-02.md` ; ce qui suit
consigne ce qui en a été FAIT.

- **✅ CLOS le 2026-08-02 (revue sécurité, ÉLEVÉ) — la garde de suppression de
  roue ne gardait rien pour un `editor`.** Elle comptait les participations
  via le client RLS, or la policy de lecture de cette table est owner-only
  (`participations: owner select`, `00017`:98) alors que `deleteWheel` laisse
  `wheels: editors` trancher : pour un éditeur, RLS rendait zéro ligne, donc
  « aucun code en attente », donc aucune case et aucun chiffre — **la
  suppression passait en silence et emportait les codes `GAIN-` non retirés**.
  Le propriétaire, lui, voyait le refus : le défaut était invisible à qui ne
  teste qu'avec un compte owner, et tous les tests existants montaient un
  compte owner. Comptage basculé sur le client admin (org-scope conservé,
  seule la colonne `id` lue), contrôle de rôle explicite ajouté. **Même trou,
  préexistant, fermé sur `deleteCampaign`.** ADR-063. *Enseignement porté
  au-delà du chantier : un défaut de garde peut être invisible au rôle qui
  écrit le test.*

- **✅ CLOS le 2026-08-02 (commit `a56cf72`) — six gestes d'entretien
  détruisaient en silence des codes qu'un client tient en main.** Suppression
  d'une roue (`participations` → `GAIN-`), d'une chasse (`hunt_completions`
  → `CHASSE-`), d'un calendrier (`CADEAU-`), d'un quiz (`QUIZ-`), d'un palier
  et d'un programme de fidélité (`FIDELITE-`) : toutes cascadent sur des codes
  émis et non retirés, et le client lisait « Code introuvable » au comptoir.
  Le dépôt avait déjà tranché ce danger un cran au-dessus pour la suppression
  de campagne — compter, refuser sans case cochée, **nommer le chiffre** ; les
  six gestes ne l'avaient jamais reçu, juste un `confirm()` de principe qui
  énumère précisément ce qui est détruit **en omettant la seule chose qui
  coûte un client**. Les six portent désormais la garde et entrent au registre
  `src/lib/destructive-confirm-coverage.test.ts`. Deux défauts du patron
  lui-même, trouvés par la revue et corrigés dans le même lot : la garde du
  calendrier ne comptait qu'une des deux tables portant `CADEAU-` (les
  récompenses d'assiduité restaient dues sur un calendrier vidé de ses cases),
  et **les sept gardes échouaient OUVERT** — `error` n'était jamais lu et
  `count === null` (réseau, délai PostgREST, policy absente le temps d'une
  migration) valait « zéro code en attente », donc la suppression irréversible
  passait sans confirmation ni trace. Décision extraite dans
  `src/lib/codes-en-attente.ts` : verdict à trois issues, refus rendu et
  jamais levé. ADR-063.

- **✅ CLOS le 2026-08-02 (commit `a56cf72`) — le stock d'un lot était
  recrédité par une simple correction de coquille.** `prizes.stock` est le
  RESTANT, décrémenté par dix RPC de tirage ; le champ de l'éditeur est un
  input non contrôlé dont la valeur par défaut est celle du **chargement de la
  page**, et `updatePrize` réécrivait la colonne en bloc. Renommer
  « Café ofert » en « Café offert » une heure plus tard recréditait les lots
  gagnés entre-temps : la roue redistribuait des cafés qui n'existaient plus,
  et rien à l'écran ne le disait. Compare-and-swap sous témoin `stock_seen`
  (ADR-065) — un contrôle contre l'accident, pas contre un appelant.

- **✅ CLOS le 2026-08-02 (commits `44ae4e9`, `011aa18`) — le claim n'était pas
  idempotent : après une coupure réseau, le joueur ne voyait JAMAIS son code.**
  La requête était committée, la réponse perdue, l'écran invitait à réessayer
  (« idempotente sur son jeton », promettait le commentaire du bouton) — et le
  rejeu lisait `claimed = true` puis sortait sans rendre le code. Recharger ne
  sauvait pas davantage, `recoverPendingWin` filtrant sur `claimed = false`.
  Le lot était décompté, la participation et le `redeem_code` existaient, le
  joueur n'avait rien à présenter. Le rejeu relit désormais la participation
  par `spin_id` et rend son code en succès. ADR-067. **Ce que le contrôle
  négatif a trouvé, et qui vaut plus que le correctif** : le défaut d'origine
  rétabli laissait la suite entière VERTE — les deux tests censés l'éprouver
  n'atteignent jamais cette branche (doubles synchrones : le second appel voit
  `spin.claimed = true` à la lecture amont et part par le chemin voisin). Le
  cas central n'était couvert par rien ; test ajouté, le sabotage rend
  maintenant 1 rouge nommé.

- **✅ CLOS le 2026-08-02 (commit `683479a`) — la reprise de gain était écrasée
  sur la roue, seul parcours à n'avoir jamais reçu la correction du
  2026-07-29.** Un joueur qui rescanne son QR et tape « Lancer la roue » avant
  que la chaîne de reprise n'ait répondu voyait son ancien gain remplacé par
  « Vous avez déjà joué cette semaine » — lot déjà décrémenté du stock,
  inatteignable depuis cet écran. `game-shell.tsx`, `scratch-experience.tsx` et
  `skill-game-shell.tsx` portaient les deux gardes (`startedRef`,
  `pendingWinRef`) depuis trois jours ; `play-experience.tsx`, le repli par
  défaut de `/play/[slug]`, ne les avait jamais reçues.

- **✅ CLOS le 2026-08-02 (commit `44ae4e9`) — le SMS de code de retrait ne
  partait jamais au premier gain.** `enqueuePrizeRedeemSms` s'exécutait DANS
  `claimPrize` et lisait `sms_consents` en premier, alors que le consentement
  n'était écrit qu'APRÈS, par un second appel déclenché à réception de la
  réponse : à la première réclamation d'un couple (organisation, numéro) la
  ligne n'existait pas encore, la fonction sortait sans déposer de job, et rien
  ne rattrapait. Sur une campagne téléphone-seul, le gagnant ne recevait ni
  e-mail ni SMS — c'est exactement le scénario que l'en-tête du module donne
  comme sa raison d'être. Le consentement est désormais porté par la même
  requête que le claim, écrit avant la mise en file.

- **✅ CLOS le 2026-08-02 (commits `44ae4e9`, `3d07534`) — quatre autres pertes
  du parcours joueur.** Le pont d'identité n'était posé pour aucune des deux
  familles `contest` et `referral` (portefeuille vide, missions de saison
  inertes — ADR-066) ; le code d'une chasse devenait irrécupérable dès que
  `ends_at` passait ou que la chasse était archivée, la page d'étape refusant
  AVANT de charger la progression alors que la caisse honore toujours le lot ;
  le sas d'une question de quiz promettait un chronomètre déjà lancé
  (`status`/`startedAt` étaient servis au client et jamais lus) ; la
  description d'un lot émis n'était pas gravée alors que son libellé l'est
  depuis `20260814120000` — migration `20260901120000` (ADR-064), avec repli
  d'affichage défensif en attendant son application.

- **✅ CLOS le 2026-08-02 (commits `cd6c65a`, `431d968`) — quatre défauts de
  comptoir et d'écran.** Le badge vert de caisse était donné au **second
  porteur** d'un code consommé depuis moins de 90 s — c'est-à-dire l'ORDRE de
  servir un deuxième lot : la distinction « vous venez de le remettre » ne se
  faisait que sur l'horloge, elle est désormais attachée au GESTE (`?remis=1`)
  et non au remettant (`reward_issuances.redeemed_by` est `null` pour la roue,
  la famille la plus courante). Les quatre messages de refus de caisse étaient
  datés au fuseau du serveur alors que la carte juste au-dessus porte celui de
  l'établissement — les deux dates du même écran se contredisaient. « Voir les
  offres » et « Gains à valider » renvoyaient un `editor` sur un mur muet
  (règle portée par la DESTINATION, `src/lib/liens-proprietaire.ts` — module
  **décoratif**, qui n'autorise rien : les redirections serveur restent la
  garde). Un checkout refusé nommait « Gérer mon abonnement », bouton que la
  même condition rendait invisible — le refus ouvre désormais le portail qu'il
  nomme.

- **✅ CLOS le 2026-08-02 (commits `683479a`, `cd6c65a`) — trois messages qui
  mentaient sur l'abonnement.** « Votre essai gratuit est terminé » était dit à
  un résilié, sur l'écran même dont le bandeau distingue correctement
  `subscriptionInactive` de `trialExpired` ; la ligne « Essai gratuit :
  7 jours » s'affichait à un abonné qui vient d'être débité (cascade à deux
  branches, tout le reste retombant sur la valeur statique du catalogue) ; la
  duplication d'une campagne perdait son plafond de dépense, la copie naissant
  sans plafond et sa pause « budget atteint » ne se déclenchant jamais.

- **Réfutée, consignée pour ne pas la rouvrir — `meta-progression-invisible-hors-roue`.**
  Le fait est exact (`ProgressionPanel` n'est monté que dans
  `play-experience.tsx`), la qualification ne l'est pas : c'est une limitation
  **décidée** (ADR-044, section Consequences), déjà portée par l'item ouvert
  « Étendre la visibilité du panneau joueur au-delà de la roue »
  (docs/roadmap.md). Un seul élément neuf y a été versé : l'éditeur laisse
  cocher les neuf familles sans avertir qu'aucune surface hors roue ne rendra
  le panneau.

**Ce qui reste OUVERT après ce chantier** — voir la section Medium Priority,
entrée « Résidus de la chasse par parcours vécu ».

**Preuve du lot** : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build
vert (Windows), 161 fichiers / 2741 tests, test:sql 12/12, migrations:check
105 fichiers, test:migrations 9/9, sql:check OK, pgTAP 42 fichiers / 2609
assertions PASS (base vide ET semée). **Les E2E n'ont PAS été exécutés** — ils
figent WSL sous la charge (piège 9 de CLAUDE.md) ; c'est la CI qui tranchera,
et c'est le seul trou de vérification de ce chantier.

**Trois contrôles négatifs ont rendu 0 rouge, et les trois fois c'était le
contrôle qui était faux, pas le code.** (a) Le mock de `participations.test.ts`
ignorait le `select()` et rendait la ligne entière : un oubli de colonne y était
structurellement invisible. (b) Le sabotage du défaut d'origine de `claimPrize`
laissait la suite verte — le cas central n'était couvert par rien. (c) Deux
montages ne dissociaient pas « le spin est déjà réclamé » de « la RPC refuse »,
rendant la branche corrigée inatteignable. La règle du dépôt — *un contrôle
négatif qui ne rougit pas est d'abord suspect de ne pas s'être appliqué* — a
payé trois fois sur un seul chantier.

### Entrées antérieures

- **✅ CLOS le 2026-08-01 (migration `20260828120000_sms_findings.sql`,
  `sms_findings.test.sql`) — Canal SMS : un propriétaire pouvait effacer sa
  propre suspension d'expéditeur en la redemandant.** `request_sms_sender`
  (`20260824120000_sms_sender_identity.sql:250-270`) remettait à `pending`
  toute ligne existante qui n'était pas `declared` non retirée — le
  commentaire de la migration ne décrivait que le cas `retired`, mais la
  branche `else` couvrait aussi `rejected` **et** `suspended`. Tant
  qu'aucun appelant applicatif n'existait, c'était inatteignable ;
  `requestSmsSender` (`src/actions/sms.ts:216-262`), livré dans ce même
  chantier, avait ouvert la porte. **Corrigé** en excluant la ligne
  `suspended` de l'`UPDATE` tout en rendant quand même son `id` (pas
  colonne par colonne : la ligne entière n'est pas touchée) — une demande
  sur un expéditeur suspendu ne change plus rien en base, la sanction
  reste lisible. Le reset de `rejected` vers `pending` est **conservé et
  justifié** : contrairement à `suspended`, un refus n'est pas une sanction
  disciplinaire, c'est un retour « corrigez et redemandez ». Le commentaire
  menteur de `20260824120000` (ne décrivant que `retired`) est corrigé pour
  dire le vrai périmètre du `else`. Contrôle négatif joué : la ligne
  entière remise dans l'`UPDATE` → 3 assertions rouges (7, 12-13) ;
  restauré → 38/38.
- **✅ CLOS le 2026-08-01 (migration `20260828120000_sms_findings.sql`,
  `sms_findings.test.sql`) — Canal SMS : le rejeu du webhook Stripe après
  une panne réseau pouvait créditer un paiement deux fois.** `creditSmsPack`
  (`src/app/api/stripe/webhook/route.ts:292-312`) prenait l'événement dans
  `stripe_events` avant de créditer, puis relâchait la prise si
  `credit_sms_balance` rendait une erreur — sous l'hypothèse « erreur =
  rien n'a été écrit », fausse si la transaction avait commité et que
  seule la réponse s'était perdue (coupure du pooler, redéploiement) :
  Stripe rejoue le même événement, la prise n'existe plus, une seconde
  écriture. **Corrigé** par un index unique partiel
  (`sms_credit_entries_one_purchase_per_reference`, sur
  `(organization_id, reference)` où `reason = 'purchase'`) et
  `credit_sms_balance` qui rend désormais l'entrée **déjà existante** sur
  conflit (cible nommée `on conflict … do update` déguisé en no-op,
  signature RPC inchangée) au lieu de lever une erreur d'unicité — la
  garde descend dans la base, là où la transaction sait, plutôt que de
  rester une hypothèse chez l'appelant Stripe. Voir ADR-059. Contrôle
  négatif joué : index retiré → 6 assertions rouges (24-25, 27, 30-31,
  34) ; restauré → 38/38.
- **✅ CLOS le 2026-08-01 (ADR-061) — Canal SMS : la fenêtre horaire ferme
  jusqu'à 10 h, le budget de reprise de la file en couvre 81 minutes — un
  gain du soir peut mourir sans SMS.** Deux gestes. **(1)** Le code de
  retrait est passé **transactionnel** (décision du client) : il sort
  entièrement de ce chemin, un gain de 23 h 30 n'attend plus la réouverture
  de la fenêtre légale (correction du 2026-08-01 : l'affirmation « part à
  23 h 30 » était trop forte — le seul consommateur de `sms.send` reste le
  cron **quotidien** `/api/cron/jobs` (`20 4 * * *`, `vercel.json`),
  `enqueuePrizeRedeemSms` ne fait que déposer un job ; l'en-tête même du
  module vivant (`src/lib/sms-dispatch.ts:46-48`) le dit : « un code de
  retrait envoyé par SMS peut arriver jusqu'à 24 h après le gain ». Ce qui
  est réellement fermé par ce geste, c'est que le gain ne peut plus être
  **bloqué** par la fenêtre horaire — pas qu'il parte instantanément).
  **(2)** Pour
  tout envoi publicitaire futur, un report de fenêtre ne consomme plus le
  budget destiné aux pannes : nouvel état `deferred` (`src/lib/jobs.ts`)
  qui repose `run_after` à la **prochaine ouverture**
  (`nextSmsMarketingOpening`) et **rend** la tentative consommée par
  `claim_jobs` ; `max_attempts` ne bornant plus la boucle, un plafond
  d'**âge** (7 jours) la borne, compteur `sms.window_deferral_exhausted`.
  **⚠️ CE QUI RESTE VRAI ET N'EST PAS RÉPARÉ** : la **cadence**. Le worker
  passe à 05 h 20 Paris, *dans* la fenêtre interdite, tous les jours — un
  publicitaire reporté à 8 h est réclamé au passage suivant, à 05 h 20,
  donc reporté encore ; il échoue proprement au bout de sept jours au lieu
  de tourner sans fin. La sortie est inchangée et appartient au client :
  poser les deux secrets Vault qui activent `lastchance-jobs-worker`
  (pg_cron, 5 min). *Texte d'origine conservé ci-dessous.*
  **↳ 2026-08-01 (ADR-062, branche `chantier/cadence-file`) — le geste est
  désormais un bouton, pas une manipulation de `CRON_SECRET`.** Le panneau
  « Cadence des workers » (`/admin/monitoring`, `monitoring.cadence`,
  super_admin) lit le secret et l'URL de l'application dans l'environnement
  serveur et les dépose lui-même au Vault ; les noms des cases écrites
  viennent du registre `ops_worker_definitions`, jamais de l'appelant.
  **↳ 2026-08-01, même branche (migration `20260831120000`, commits
  `f127f8f`/`b362993`/`1d30c6b`) — la RPC `set_worker_vault_secrets` est
  livrée et revue.** Un refus prévisible (worker inconnu, prérequis Vault
  absents, valeur vide) est rendu comme statut plutôt que levé, pour ne pas
  imprimer `CRON_SECRET` dans les journaux Postgres (seul le refus
  d'autorisation lève). Revue sécurité GO, 0 CRITIQUE, 0 ÉLEVÉ, 1 MOYEN :
  `worker-cadence.ts` valide `https://` + hôte public mais pas « c'est bien
  l'application » — armer la cadence depuis une URL de déploiement
  non-production ferait émettre le `CRON_SECRET` de production vers un hôte
  tiers 288×/jour, écran affichant « configuré » pendant ce temps ; correctif
  proposé (refuser si `VERCEL_ENV ≠ production`) **non livré**. **Ce qui
  reste vrai malgré tout ceci** : la migration doit être **appliquée en
  production**, puis le bouton doit encore être **cliqué** par le
  propriétaire. Tant que l'un des deux n'a pas eu lieu, la file tourne
  toujours une fois par jour. Non refermé : requalifié une seconde fois.
  **↳ 2026-08-01, même branche (commits `b97f344`, `4bfa714`, `8c87128`) —
  le MOYEN est FERMÉ.** `checkCadenceEnvironment` (module pur) refuse
  d'armer si `VERCEL_ENV ≠ production` (absente = refus) et, quand
  `VERCEL_PROJECT_PRODUCTION_URL` est exposée, compare son hôte à celui de
  `NEXT_PUBLIC_APP_URL` — seul angle attrapant une `APP_URL` périmée sur
  une vraie production. Ce qu'elle ne couvre pas est écrit, pas tu :
  `VERCEL_PROJECT_PRODUCTION_URL` non vérifiée à l'exécution sur ce projet
  → sans elle, pas de comparaison possible, `production_host_verified`
  part à l'audit pour le relire après coup. Contrôle négatif : garde
  neutralisée → 14 rouges. **Au passage** : la justification originale du
  refus « rendu, jamais levé » (fuite de `CRON_SECRET` dans les journaux
  Postgres) était **fausse**, mesurée et corrigée — `log_parameter_max_length_on_error = 0`
  en base, aucune valeur liée n'est journalisée ; le design est gardé pour
  une autre raison, un refus prévisible n'a rien à faire dans un journal
  d'erreur (détail `docs/decisions.md` ADR-062). Et l'avertissement
  pré-clic du panneau sous-déclarait le worker voisin dont l'entrée Vault
  est réécrite (`ops.ts` filtrait par `vault_url_secret` alors que la RPC
  écrit aussi sur `vault_shared_secret`) — filtre retiré, contrôle négatif
  2 rouges. Chantier `chantier/cadence-file` COMPLET, plus rien d'ouvert
  côté code sur ce module ; seules restent les deux conditions hors dépôt
  (migration appliquée, bouton cliqué en production).
  **↳ 2026-08-02 — la prémisse de tout ce chantier était FAUSSE, mesurée
  et non déduite.** Le journal du workflow `production-health.yml` sur le
  commit `46c33dc` rend « Production saine (0.1.0) : database, workers,
  security_configuration » à 17h36 UTC. `checkWorkers()`
  (`src/app/api/health/route.ts`) exige que `jobs` **et** `sync-contests`
  soient `healthy = true`, ce qui suppose à la fois les entrées Vault
  posées et un battement récent — tolérance 900 s (15 min) pour `jobs`.
  Le cron Vercel de secours passe à 04h20 UTC, treize heures avant cette
  sonde ; un battement de treize heures ne peut pas satisfaire une
  tolérance de quinze minutes. **Conclusion : les secrets Vault
  existaient déjà en production et le pg_cron toutes les 5 minutes
  tournait déjà** — la file de jobs SMS ne passait pas une fois par jour
  comme les six requalifications ci-dessus l'ont affirmé, chacune à son
  tour, sans qu'aucune ne consulte le signal qui le contredisait déjà à
  chaque fusion. Ce que ce chantier a réellement livré n'est donc pas un
  déblocage mais une **rotation** par-dessus une configuration qui
  fonctionne : le risque s'inverse, un mauvais armement ne débloque rien
  dans le vide, il casse une file qui tourne — ce qui vaut plus aux
  gardes déjà posées, pas moins. `docs/production-readiness.md` §5bis
  corrigé (le geste n'est plus listé comme requis), ADR-062 complété
  d'un troisième addendum. Voir aussi la correction de justification
  ci-dessous.
- **~~Canal SMS : la fenêtre horaire ferme jusqu'à 10 h, le budget de reprise
  de la file en couvre 81 minutes~~ (état d'origine)** — 2026-08-01,
  contre-revue du troisième tour, lecture seule.
  `smsMarketingWindow` (`src/lib/sms-window.ts`) renvoie `retry` toute la
  nuit (22h-8h, dimanche, jour férié) plutôt que `failed` : le message
  n'est pas fautif, il est prématuré. Mais `/api/cron/jobs` ne passe
  qu'**une fois par jour** (`20 4 * * *`, `vercel.json`) et `sms_jobs.
  max_attempts` vaut 5 — le budget de reprise réel est donc de l'ordre de
  quelques passages du cron, pas d'une nuit entière. Concrètement : un gain
  remporté après la fermeture de la fenêtre épuise ses tentatives avant la
  réouverture, et le joueur ne reçoit jamais son code par SMS. **Sortie
  déjà identifiée et documentée dans le code, non actionnée** :
  `lastchance-jobs-worker` (pg_cron, migration `20260722100000`) tourne
  déjà toutes les 5 minutes mais reste inactif tant que les secrets Vault
  `jobs_worker_url` et `sync_contests_secret` n'existent pas — les poser
  suffit, aucune migration requise. Décision de plan, appartient au
  client. Voir aussi `src/app/api/cron/jobs/route.ts` (en-tête) et
  ADR-059.

- **✅ CLOS le 2026-08-01 (migration `20260830120000_sms_sanction_renommage.sql`,
  commit `31268a0`) — Canal SMS : renommer son expéditeur levait sa propre
  suspension sans qu'aucun humain ne l'ait décidée.** Le trigger
  `sms_senders_declaration_follows_name`
  (`20260824120000_sms_sender_identity.sql`) protégeait déjà le
  **registre** (`declared → pending` dès que `sender_id` change, pour
  forcer une redéclaration AF2M sur le nouveau nom) mais ne regardait que
  `new.status`, jamais `old.status` : un expéditeur `suspended` qui
  renommait son `sender_id` — via `set_sms_sender_status`, seul chemin
  d'écriture — retombait en `pending` **avec sa sanction effacée**,
  identique au défaut fermé au troisième tour (A) mais par un angle
  différent (le nom plutôt que la demande). **Corrigé** : garde étendue à
  `old.status = 'suspended' or new.status = 'suspended'` — la disjonction
  est nécessaire, `old` seul ne couvre pas l'`UPDATE` qui suspend et
  renomme dans le même geste. `status_reason` et le statut `suspended`
  sont désormais conservés tels quels quand la sanction est en jeu ; le
  renommage normal (`declared → pending`) est inchangé. Contrôle négatif
  joué : corps d'origine de `20260824120000` remis **en base** (vérifié
  dans `pg_proc`, pas seulement dans un fichier) → 3 rouges nommés sur 76
  (suspension conservée, motif conservé, garde de déclaration qui voit
  toujours la sanction) ; restauré → 76/76.

## Medium Priority

### ✅ CLOS (2026-08-07, `chantier/atelier-modules`) — « Enregistrer l'événement » des pronostics effaçait `default_locks_at`

`contest-settings.tsx:446-450` postait un champ caché `default_locks_at` vide
dès que le commerçant enregistrait la carte Matchs sans toucher la date de
clôture par défaut — la RPC recevait alors une valeur vide et l'effaçait,
même si l'intention était de ne rien changer sur ce champ. Débusqué en
concevant l'étape « Les matchs » de l'Atelier pronostics. **Corrigé** :
l'input caché est désormais pré-rempli depuis la valeur en base ; le bouton
de l'étape reste grisé sur un no-op, ce qui prouve le correctif par le test
plutôt que de le décrire.

### ✅ CLOS (2026-08-07, `chantier/atelier-modules`) — cinq 404 injustifiés sur des pages détail refusant le droit payé

Les pages détail de chasse, fidélité et pronostics appelaient `notFound()`
sur des vérifications de droit trop strictes pour un brouillon (créable
gratuitement depuis la liste, mais dont la page détail exigeait déjà l'accès
payant du module — cas vivant : `hasPronosticsAccess`). **Corrigé** : les
deux visages (suivi et atelier) passent par `capacitesDuModule(<module>)` +
`ModuleCapabilityNotice`, `notFound()` réservé au cas `!canExplore`.

### ✅ CLOS (2026-08-07, `chantier/atelier-modules`) — deux ancres `#reglages` menteuses et un écran comptoir jackpot hors de son mode

Deux liens de la Carte de l'Aventure pointaient vers `#reglages` sur des
pages où cette ancre n'existait plus dans la vue suivi (chasse → menait en
réalité aux Étapes, fidélité → aux Paliers) ; corrigés vers `?etape=` de
l'étape réelle. L'écran comptoir du jackpot s'affichait quel que soit
`validation_mode`, y compris dans un mode où il ne produit rien ; désormais
conditionné au mode qui le produit (stepper adaptatif 2↔3 étapes).

### OUVERT (2026-08-07, `chantier/atelier-modules`) — pronostics n'a AUCUNE garde de publication côté serveur

Consigné en clôture de L'Atelier partout, hors périmètre assumé (design
doc, section « Hors périmètre »). Contrairement aux six autres modules,
aucun `activationBlocker` n'existe côté serveur pour les pronostics : un
championnat sans match, sans question et sans récompense reste publiable
par appel direct à la RPC. L'étape « La vérification » de l'Atelier ne fait
que RACONTER l'état à l'écran (matchs=0, questions=0, récompenses=0,
échéances passées) sans rien bloquer. **À arbitrer** avec la dette voisine
`set_campaign_status` ci-dessous : même classe de défaut, deux modules.

### OUVERT (2026-08-07, `chantier/atelier-modules`) — dettes assumées de la découpe en étapes

Quatre points laissés hors périmètre par construction, consignés en clôture
de L'Atelier partout (design doc, section « Hors périmètre ») : (1) les cinq
schémas monolithiques (`updateQuiz`, `updateCalendar`, `updateHunt`,
`updateLoyaltyProgram`, `updateJackpotCampaign` — 14 champs pour ce dernier)
n'ont pas été assouplis en partiel, chacun reste une étape indivisible qui
exige tous ses champs même pour ne corriger qu'un seul ; (2) les 3
formulaires `updateContest` (renommer, inscriptions, TTL) n'ont pas été
fusionnés en un seul, ils restent côte à côte dans l'étape « Le
championnat » ; (3) une question de pronostics posée reste INSERT-only, sans
chemin de modification une fois publiée ; (4) les données de suivi du quiz
restent pauvres, le leaderboard n'étant lu par aucune page. À ces quatre
s'ajoute une INFO de la revue sécurité laissée en suivi : `createLoyaltyOrderCodes`
n'a pas de garde de module propre (impact nul mesuré — les jetons générés
restent inertes tant que le programme est en brouillon, mais la garde
manque pour la cohérence avec les autres actions de création).

### OUVERT (2026-08-07, `chantier/assistant-creation`) — la publication n'a pas de garde métier en base

Consigné en clôture de L'Atelier du jeu, hors périmètre assumé (design doc,
section « Hors périmètre »). `set_campaign_status` accepte l'ouverture d'une
campagne sans lot gagnant tirable ni fenêtre valide : l'Atelier vérifie
l'écran (étape La vérification, checklist testée) mais rien n'empêche un
appel direct à la RPC ou une régression future d'une page qui publierait
sans passer par l'Atelier. **À arbitrer** : une migration qui refuse le
passage à `active` sans lot tirable, symétrique du contrôle client. Non
fermé faute de décision produit sur le niveau de rigueur souhaité (bloquant
en base vs. avertissement à l'écran).

### OUVERT (2026-08-07, `chantier/assistant-creation`) — `prizes.is_active` n'est écrit par aucune action

Relevé pendant la conception de l'Atelier : la colonne existe et est lue par
le calcul de tirage, mais aucune action serveur ne l'écrit — impossible de
« mettre un lot en réserve » sans le supprimer. L'Atelier ne propose donc pas
ce geste (décision assumée, pas un oubli). **À traiter** si le besoin de
réserve de lot est confirmé côté produit.

### OUVERT (2026-08-07, `chantier/assistant-creation`) — réordonnancement des segments impossible

Aucune action serveur ne permet de changer l'ordre d'affichage des lots sur
la roue une fois créés ; seul l'ordre de création fait foi. Hors périmètre
de l'Atelier (design doc), consigné pour un futur lot si demandé.

### OUVERT (2026-08-07, `chantier/assistant-creation`) — quota brouillon absent du chemin `applyCampaignTemplate`

`createCampaign` applique un quota de brouillons ; `applyCampaignTemplate`
(application d'un modèle depuis la place de marché) ne le vérifie pas —
chemin de création distinct, préexistant au chantier, simplement remarqué en
chemin. **À arbitrer** : aligner les deux chemins ou documenter l'écart
comme volontaire.

### OUVERT (2026-08-07, `chantier/assistant-creation`) — cul-de-sac « Roue manquante »

Une campagne sans roue associée (état atteignable, préexistant) affiche un
message « Roue manquante » sans bouton pour en créer une depuis cet écran.
Non corrigé dans ce chantier (périmètre : la roue courante du cas nominal).

### OUVERT (2026-08-07, `chantier/assistant-creation`) — `CampaignEngagementSettings` mort à purger

Composant identifié sans appelant restant après la réécriture de la page
roue en Atelier. Laissé en place (suppression hors périmètre de ce lot,
aucun risque à le laisser mort) — à purger au prochain passage sur ce
répertoire.

### OUVERT (2026-08-07, `chantier/assistant-creation`) — `campaign-template-preview.ts` garde sa propre copie du catalogue de mécaniques

L'Atelier a résorbé trois copies divergentes du catalogue de mécaniques et
du calcul `partSur10` en modules purs testés et partagés (étapes Lots et
Vérification). `src/lib/campaign-template-preview.ts`, utilisé par la place
de marché de campagnes, garde sa propre copie des libellés — hors périmètre
de ce lot (il ne consomme pas les mêmes réglages), consigné pour éviter une
divergence future si les libellés changent d'un côté sans l'autre.

### OUVERT (2026-08-07, `chantier/clarte-commercant`) — pages en lecture seule sans redirect de rôle

Relevé en INFO par la revue sécurité de la refonte clarté, **préexistant au
lot**. Certaines pages de réglages (`/dashboard/settings/modules` et
équivalentes) restent accessibles en lecture à un rôle qui ne devrait pas
même les voir, au lieu d'un redirect immédiat — les gestes mutants, eux,
restent bien gardés côté serveur (`is_org_editor`/`is_org_owner`), donc
aucune écriture n'est exposée. **À arbitrer** : ajouter le redirect de rôle
en tête de page pour la cohérence de navigation, ou documenter que la lecture
seule est jugée sans conséquence tant que l'écriture reste gardée. Non fermé
faute de décision produit tranchée.

### ✅ CLOS pour partie (2026-08-07, `chantier/atelier-modules`) — liens orange sous 4.5:1 : fermé sur les surfaces atteignables

Ouvert en `chantier/clarte-commercant` (token `--color-k-orange-text:
#b45309`, 4.66:1 sur crème / 5.02:1 sur blanc, appliqué seulement aux zones
touchées par ce chantier-là). `e2e/atelier-modules.spec.ts`, premier scan
axe des pages `hunt-posters` (affiches de chasse) et `order-code-cards`
(cartes de commande de fidélité), a débusqué et fait fermer les liens
orange bruts de ces deux surfaces sur trois tours de CI — la dette est donc
close pour toute surface qu'un scan axe atteint désormais. **Reste ouvert** :
`qr-code-card` et `text-k-body/80` de la galerie de blueprints, toujours
hors de tout scan axe, non touchés par ce lot.

### OUVERT (2026-08-06, `chantier/dashboard-guide`) — les jetons d'étape de la chasse au trésor sont lisibles par le rôle caisse

Relevé en INFO par la revue sécurité du dashboard guidé, **préexistant au
lot** — ni introduit ni corrigé par lui, simplement remarqué en chemin et
consigné pour ne pas se reperdre. Le rôle `caissier` (accès de caisse
minimal, pensé pour la validation d'un code de gain) peut lire les jetons
d'étape de la chasse au trésor, qui ne devraient être opposables qu'au
joueur en progression. Aucun scénario d'abus concret identifié à ce stade —
la caisse ne fabrique ni ne rejoue ces jetons — mais la portée de lecture
excède le besoin du rôle. **À arbitrer** : soit resserrer la policy RLS des
jetons d'étape pour exclure `caissier`, soit documenter explicitement
pourquoi la lecture est jugée sans conséquence. Non fermé faute de décision
produit tranchée sur laquelle des deux voies prendre.

### Résidus de la chasse par parcours vécu — révisée une TROISIÈME fois le 2026-08-03 (branches `chantier/residus-chasse`, `chantier/derniers-ouverts`, puis `chantier/solde-bugs`)

Six entrées consignées le 2026-08-02. **Quatre sont fermées** par le chantier
`chantier/residus-chasse` (migration `20260902120000`, cinq commits, HEAD
`c9994fd`) ; les **deux restantes ne sont pas des dettes mais des décisions**,
et sont reformulées comme telles. Ce chantier a en revanche ouvert ses propres
points — **les trois derniers ouverts du dépôt, tous fermés depuis** par
`chantier/derniers-ouverts` (migration `20260903120000`, quatre commits, HEAD
`8b3ffda`). La section « laisse OUVERT » ci-dessous est **révisée en place**,
et ce que le second chantier laisse à son tour est écrit à la suite.

**Troisième révision, le 2026-08-03 (`chantier/solde-bugs`, HEAD `68ccf26`,
aucune migration)** — demande du propriétaire : « règle ce qui reste dans
bugs.md ». Sept entrées portaient encore « OUVERT ». **Trois étaient de vraies
dettes et sont fermées par du code** (le seau de rappel qui ne bornait rien, la
cause d'annulation absente des deux cartes de caisse, l'IP illisible agrégée en
un seau unique). **Les quatre autres n'étaient pas des dettes mais des
arbitrages**, et l'étiquette « OUVERT » faisait croire à un correctif en
attente : elles sont **requalifiées en décisions** (ou, pour l'échéance des
sept familles, en **question posée au propriétaire**). Ce que ce troisième
chantier ouvre à son tour est écrit en fin de section.

#### Les quatre fermées

- **✅ CLOS le 2026-08-03 — le portefeuille du joueur survivait à la
  suppression de sa source.** `player_wallet` lit `reward_issuances` **sans
  jointure sur la table source** et les dix triggers de miroir étaient
  `after insert or update`, jamais `delete` : après une suppression confirmée,
  la ligne de registre restait orpheline et le client voyait son lot « active »
  pendant que la caisse le refusait. Les six gardes d'ADR-063 réduisaient la
  fréquence du cas sans le fermer. **Corrigé — arbitrage : marquer, pas
  détruire** (ADR-068). Dix triggers `after delete` posent `cancelled_at`.
  L'état `cancelled` existait déjà de bout en bout — le portefeuille le
  calcule, l'écran l'affiche, `redeem_reward_by_code` le lit avant toute route
  legacy — donc le client lit une **explication** au lieu de constater une
  disparition, et la trace subsiste pour `org_weekly_digest`, dont le
  commentaire dit qu'un lot annulé reste émis.

- **✅ CLOS le 2026-08-03 — un lot de roue gagné via un TOUR OFFERT était
  absent du portefeuille.** Les quatre RPC de consommation (calendrier,
  fidélité, quiz, parrainage) insèrent le spin avec le `player_key` **du
  module** ; le miroir cherche un pont `('campaign', campaign_id, player_key)`
  qui n'existait pour personne. **Corrigé** par
  `bridgeOfferedSpinToCampaign`, qui relit le triplet **sur le spin** et non
  sur l'appelant — même source que celle que le miroir interrogera, donc le
  triplet ponté ne peut pas diverger de celui qui sera cherché. Source
  d'acquisition `unknown` et non `direct` : `resolve_player_identity` ne
  remplace une source posée que si elle vaut `unknown`, donc `direct`
  mentirait définitivement. ADR-066 (Consequences corrigées).

- **✅ CLOS le 2026-08-03 — la caisse disait « Code introuvable » là où elle
  sait dire « Ce lot a été annulé ».** `routeRedeemCode` rendait `null` dès
  que la table legacy ne portait plus la ligne, **sans jamais atteindre**
  `tryUniversalRedeem` : le bon message existait, il n'était pas atteint, et
  le caissier opposait donc à un vrai gagnant le même refus qu'à un code
  inventé. Corrigé au même lot que l'annulation au registre, dont il est la
  moitié applicative — une migration ne pouvait pas le faire.

- **✅ CLOS le 2026-08-03 — `ensureProgressivePlayerIdentity` avalait toute
  panne sans un mot, et `loadHuntRecallContext` n'était pas borné.** Traces
  ajoutées sur les quatre sorties en échec (`reportError` + compteur
  `player-identity.bridge-failed.<motif>.<famille>`), **étouffées par fenêtre
  de 60 s et par cause** — sans étouffement, une cause générale produisait un
  événement Sentry et un `insert` `ops_metrics` **par requête joueur**, c'est-à-dire
  que l'observabilité se détruisait elle-même au moment précis où l'on en a
  besoin. Le compteur mesure donc les **fenêtres porteuses d'échec** et non
  l'amplitude ; zéro reste la valeur saine. Trois gardes posées sur le rappel
  de chasse (ADR-070).

#### Les deux qui restent — ce sont des DÉCISIONS, pas des restes

- **DÉCIDÉ, non une dette — sur un appareil partagé, la reprise du gain est
  déterministe.** Le modèle d'identité du produit **est** le cookie de
  l'appareil : c'est lui qui porte le portefeuille, la complétion de chasse et
  la reprise de gain, et il n'y a pas de compte joueur à opposer. La fenêtre
  est de 30 min, et le comportement était déjà atteignable par course avant le
  chantier du 2026-08-02. Rien à corriger tant que le modèle d'identité ne
  change pas ; le jour où il changerait, c'est cette décision-là qu'il faudrait
  rouvrir, pas ce symptôme.

- **DÉCIDÉ (ADR-067) — le rejeu d'une réclamation ne réémet ni e-mail ni SMS.**
  On **COMPTE** (`play.claim-replay-sans-renvoi`) plutôt que de réémettre :
  aucune trace par participation ne distingue « l'invocation est morte après le
  commit » (les envois ne sont pas partis) de « la réponse s'est perdue en
  transit » (ils SONT partis), et réémettre à l'aveugle ferait des doublons
  dans le cas fréquent. Ce n'est pas un correctif reporté, c'est le refus
  d'agir sans donnée — même règle qu'ADR-048. **Si le compteur s'avère non
  nul, le correctif juste est une trace d'envoi par participation.**

#### Ce que le chantier du 2026-08-03 avait laissé OUVERT — les trois derniers, tous FERMÉS le même jour

Révisée en place par `chantier/derniers-ouverts`. Trois entrées étaient de
vraies dettes, une était fausse dans sa formulation, une reste ouverte.

- **✅ CLOS — sept familles sur neuf n'ont aucune expiration au registre, donc
  un lot à source purgée y était conservé indéfiniment.**
  `sync_reward_issuance` écrit `null` pour hunt, loyalty, jackpot, event,
  calendar (×2), referral et quiz ; seuls `wheel` et `contest` portent une
  échéance. La ligne n'était terminale pour aucune des trois branches du
  prédicat de purge : **aucun chemin ne la supprimait jamais**, alors qu'elle
  porte un `player_id` et qu'il n'existe aucune purge de `public.players`.
  **Fermé par un délai de grâce** (migration `20260903120000`, ADR-071) : la
  ligne n'est plus encaissable dès que sa source disparaît, sa seule valeur
  restante est d'**expliquer**, et une explication a une échéance. Durée
  **bornée** par `least(3 mois, fenêtre de rétention de l'organisation)`,
  courant depuis `cancelled_at` (jamais `issued_at`, qui est
  `participations.created_at` pour la roue — le critère exact que la purge
  vient d'appliquer, ce qui rendrait la grâce nulle) et **ANDée** au critère
  d'âge, jamais substituée.

- **✅ CLOS — `loadHuntStepContext` n'était borné par rien.** Quatre chantiers
  l'avaient consigné sans rien poser. **Le seau bloquant reste REFUSÉ, et la
  revue sécurité a confirmé ce refus** : le jeton d'étape est imprimé sur un QR
  de vitrine (un seau dessus ferme la chasse à tout le lieu — l'interrupteur
  qu'ADR-032 interdit), et le cookie de chasse n'existe pas au premier scan —
  or le premier scan **est** le produit. Recopier ici le seau du rappel serait
  pire qu'ailleurs : l'amplification passe par le chemin **sans cookie**, donc
  le seau siégerait sur la seule route que l'abuseur ne prend jamais. **Ce qui
  est livré à la place** : le coût public est **mesuré** — trois lectures
  `service_role` sans cookie, quatre avec un cookie arbitraire, six pour un
  joueur retrouvé, épinglé table par table ; les documents annonçaient « ~4 »
  sans que personne ait jamais compté. Et un `observeSharedKey` sur (chasse,
  IP), seau `huntStepIp` **fail-open**, rend l'amplification visible sans
  jamais rien refuser. ADR-073.

- **✅ CLOS — deux gardes ne prouvaient pas ce qu'on croyait.** (a)
  `player-identity-coverage.test.ts` est **textuelle** — un `void 0 &&` sur
  les quatre appels la laissait entièrement verte. Elle est **conservée** (elle
  se dérive du dossier `src/actions`, donc un cinquième module d'offre y arrive
  tout seul) et **complétée** par `src/actions/offered-spin-bridge.test.ts`,
  qui **exécute** les quatre chemins contre des doubles, avec deux
  contre-exemples par module. **L'écart entre les deux fichiers EST la
  démonstration**, mesuré : sur le même sabotage, la comportementale rend
  4 rouges / 8 verts, la textuelle 15 verts et 0 rouge. ADR-074. (b) La garde
  des littéraux SQL comparait au **fichier de migration** : deux assertions
  pgTAP lisent désormais `pg_proc.prosrc` et **nomment** la constante à
  déplacer. **La mesure a corrigé cette entrée** : cinq assertions
  préexistantes rougissaient déjà sur ce sabotage, donc « une redéfinition
  passerait sans que rien ne rougisse » était **trop large** — ce qui manquait
  n'était pas la détection mais la **désignation**, les cinq préexistantes
  faisant corriger la fixture et non la constante.

- **✅ CLOS le 2026-08-03 (`chantier/solde-bugs`) — le seau `huntRecall` ne
  bornait pas un débit, et rien n'était posé à côté.** Le constat reste
  intégralement vrai : sa clé contient le sha256 de la **valeur** d'un cookie
  `httpOnly` — caché à JavaScript, pas à l'utilisateur, qui peut la faire
  tourner à chaque requête ; les deux gardes de cookie amont passent (elles ne
  regardent que le NOM), le hash est neuf à chaque coup, aucun seau ne se
  remplit. Il borne un porteur **coopératif**, et c'est délibérément conservé à
  ce titre. **Ce qui change : quelque chose est enfin posé à côté.** Un
  `observeSharedKey` sur (chasse, IP), seau `huntRecallIp`, **fail-open**,
  intercalé **entre la garde 2 et la garde 3** — c'est-à-dire exactement sur la
  population que la garde 3 prétendait borner, et l'IP est la seule clé de ce
  chemin que l'appelant ne choisit pas. C'est l'application directe du terme
  moyen établi par ADR-073 : ADR-032 proscrit de *refuser* sur une clé
  partagée, elle *prescrit* un compteur large et fail-open — quatre chantiers
  avaient conclu « rien à faire » en sautant ce terme. **Le `failClosed: false`
  d'ADR-070 est intact : un compteur ne refuse rien.**
  **La décision délicate, avec son motif** : seau **propre** et non
  réutilisation de `huntStepIp`, bien que les deux chargeurs servent la **même
  requête de la même page**. `loadHuntRecallContext` ne s'exécute qu'après le
  refus de `loadHuntStepContext`, qui a déjà consommé son compteur : sur une
  clé commune, un passage compterait pour deux — exactement la raison qui tient
  déjà `huntStepIp` séparé de `huntScanIp`. Séparés, **leur rapport est
  l'information** : la part du trafic d'une chasse qui retombe sur le repli,
  c'est-à-dire sur le chemin qui refait toutes les lectures. ADR-070 (Consequences
  corrigée), ADR-073.

- **✅ CLOS le 2026-08-03 (`chantier/solde-bugs`) — `WheelResult` et
  `ContestResult` rendaient « annulé » sans cause.** Le caissier lisait deux
  vocabulaires selon le chemin qui l'avait servi : la carte du registre
  distingue les trois causes, ces deux cartes-là n'en énonçaient aucune.
  `phraseCaisseAnnulation("merchant")` est désormais rendue sous les deux
  badges. **Aucune lecture de `cancelled_source` n'a été fabriquée, et le
  pourquoi est dans le code** : ces chemins lisent la table parente
  **vivante**, donc atteindre ces branches *prouve* que la ligne parente
  existe encore — or les deux autres causes la font justement disparaître
  (purge de rétention, cascade d'un geste d'entretien) et la caisse retombe
  alors sur `tryUniversalRedeem`, c'est-à-dire sur la carte du registre. Une
  lecture dont la réponse est connue d'avance aurait laissé croire à une
  distinction que ce chemin ne peut pas porter. Le paramètre est typé
  `CauseAnnulation` : **élargir le vocabulaire fait échouer `tsc`** plutôt que
  de laisser ces deux cartes muettes. ADR-069, ADR-072, ADR-074 (ce qu'une
  garde textuelle ne prouve pas).

#### Le reliquat, révisé le 2026-08-03 par `chantier/solde-bugs` — ce ne sont plus des dettes

La demande du propriétaire était « règle ce qui reste dans bugs.md ». Trois
entrées ont été **fermées par du code** (voir ci-dessus, plus
`clientIpFromHeaders` juste en dessous). **Les quatre qui suivent portaient
« OUVERT » à tort** : ce sont des **arbitrages**, pas des correctifs en
attente. Elles sont requalifiées ici pour que le lecteur comprenne en une
ligne que **personne n'attend un correctif**, et pourquoi.

- **✅ CLOS le 2026-08-03 — `clientIpFromHeaders` rend `"unknown"` hors proxy
  déclaré, et tous les visiteurs tombaient dans un seau unique.** Le défaut
  n'était pas qu'elle rende `"unknown"` (c'est délibéré : les en-têtes
  génériques sont forgeables) mais que les appelants la **concatènent telle
  quelle** — une seule ligne agrégée `…:unknown`, à un seuil calibré pour UN
  visiteur, où la supervision ne pouvait distinguer ni une pression mono-IP
  d'un agrégat, ni un zéro sain d'un zéro aveugle. **Fermé pour les deux
  compteurs chasse** par `pressionParIp` (module pur neuf,
  `src/lib/request-ip.ts`) : la clé devient `ip-non-mesuree` — qui ne peut pas
  se lire comme une adresse — et l'événement gagne le suffixe
  `.ip_non_mesuree`, donc **deux séries qu'aucun tableau de bord ne peut
  confondre, ni par clé ni par nom**. **Motif de l'arbitrage : compter quand
  même plutôt que s'abstenir.** S'abstenir aurait rendu un trou honnête mais
  aurait jeté la **détection** avec l'attribution — sous un débit réel
  l'agrégat franchit le seuil, et c'est le seul signal qui subsiste là où
  aucun proxy n'est déclaré. On garde la détection, on perd l'attribution, et
  on le dit deux fois. ADR-073 (Consequences corrigée).

- **DÉCISION, pas une dette — le repli `merchant` est indistinguable entre
  « décidé à la main » et « cause illisible ».** Sur la caisse comme sur le
  portefeuille, les deux rendent la même phrase : aucune surface ne peut
  signaler une valeur hors vocabulaire. **C'est un alignement délibéré** —
  deux écrans qui parlent au même client ne doivent pas se contredire — et non
  un correctif reporté. Écrit ici pour ne pas être redécouvert comme un
  défaut. ADR-072.

- **DÉCISION, pas une dette — les trois calibrages par IP de la chasse ont une
  seule origine.** `huntStepIp` (200 / 10 min) est hérité de `huntScanIp`, et
  `huntRecallIp` hérite à son tour de `huntStepIp` : **trois seuils, une seule
  origine**, et c'est écrit plutôt que dissimulé derrière trois chiffres
  d'apparence indépendante. **Aucun n'a été mesuré, parce qu'il n'y a aucun
  trafic réel à mesurer** : la production porte une seule organisation, celle
  du propriétaire. Un chiffre inventé ne vaudrait pas mieux qu'un chiffre
  hérité et raisonné ; l'héritage de `huntRecallIp` est au moins *dérivé* (les
  requêtes qu'il compte sont un sous-ensemble strict de celles de
  `huntStepIp`). À reprendre le jour où du trafic existe, pas avant.
  ADR-073.

- **DÉCISION, pas une dette — `cancelled_reason` porte toujours les deux
  sentinelles textuelles.** Elles **ne décident plus rien** depuis qu'ADR-072 a
  déplacé la cause dans `cancelled_source` ; ce ne sont plus que du texte
  résiduel. Les refuser au formulaire serait un **palliatif** : il ne
  couvrirait pas le `PATCH` PostgREST direct, et il **laisserait croire à une
  garde** là où la fiabilité vient d'ailleurs — de l'absence totale d'écrivain
  applicatif sur `cancelled_source`. Un demi-contrôle qui se lit comme un
  contrôle entier est pire que pas de contrôle. ADR-072.

- **✅ TRANCHÉ (2026-08-04, `chantier/echeance-lots`) — les sept familles sans
  échéance, pour les lots NON annulés.** La question était : un lot émis,
  jamais remis, jamais annulé, restait conservé sans fin, et personne dans le
  code n'avait autorité pour décider d'y mettre un terme. **Le propriétaire a
  choisi la première des deux formes proposées — une échéance par famille,
  réglable.** `code_ttl_days` (1 à 365 jours, `null` = sans limite et c'est le
  défaut, donc aucun lot existant ne change de sort), gravée à l'émission par
  trigger et jamais recalculée : modifier le réglage ne raccourcit ni ne
  rallonge un code déjà dans la poche d'un client. Migration
  `20260904120000`, réglable depuis les sept éditeurs, et le client retrouve
  la validité de ses lots par le lien « Mes récompenses ». Détail : roadmap
  V1.32.

#### Ce que `chantier/echeance-lots` FERME et OUVRE (2026-08-04)

- **✅ CLOS — trois pages sur sept ne lisaient pas le réglage qu'elles
  réécrivaient.** Jackpot, fidélité et calendrier sélectionnaient leurs
  colonnes une par une sans `code_ttl_days` : le champ s'affichait vide, le
  commerçant relisait « Sans limite » là où il avait réglé 30 jours, et le
  premier enregistrement du même formulaire reposait `''` — donc **effaçait
  réellement le réglage**, sans message et sans trace. **Le point instructif
  n'est pas l'oubli mais que la garde d'écriture était INTACTE** : elle
  recevait une clé présente et une valeur vide, exactement le geste « efface »,
  indistinguable du geste volontaire. Une garde posée au bon endroit ne protège
  de rien quand c'est l'**alimentation** du formulaire qui manque. Fermé par
  les trois `select` et par une garde qui **se dérive** (`src/lib/code-ttl-days-chargement.test.ts`).

- **✅ CLOS — `/portefeuille` n'était lié depuis aucun écran du produit.** La
  page rassemble les lots des neuf familles et lit leur échéance dans le
  registre, mais son adresse n'apparaissait que dans son propre fichier : un
  client ne pouvait y arriver qu'en la devinant. Même motif que les capacités
  écrites en base sans appelant applicatif, pris du côté de l'écran. Huit liens
  « Mes récompenses », gardés par `src/lib/portefeuille-atteignable.test.ts`.

- **✅ CLOS (2026-08-04, `chantier/lien-roue-et-rendu`) — la roue porte le
  lien.** Et pas là où cette entrée l'annonçait : elle parlait de « ses trois
  écrans », or les trois délèguent au **même** composant, `RedeemCodeScreen`
  (`claim-form.tsx`), point de passage de **huit** surfaces — les quatre écrans
  de roue/skill et les quatre tours offerts. Un seul point d'insertion au lieu
  de trois, huit surfaces couvertes au lieu de quatre. Le lien est posé dans
  **ses deux vues**, la seconde étant la plus utile : sur le code expiré,
  « rapprochez-vous du staff » laissait le client sans rien à regarder alors
  que ses **autres** lots sont peut-être encore bons.

- **✅ CLOS — la limite n'était pas de nature, elle était de configuration.**
  « Faute d'environnement de rendu React » était exact (`include` limité aux
  `.test.ts`, `environment: "node"`), avec une conséquence que personne n'avait
  écrite : un test de composant n'était pas *rouge*, **il n'était pas
  collecté**. Levé par `happy-dom` + `@testing-library/react` (ADR-076), `node`
  restant le défaut. **Douze en-têtes affirmaient cette limite** dans tout le
  dépôt — corrigés en place, sans qu'aucune conclusion soit annulée.

  **Les gardes textuelles ne sont PAS remplacées**, et c'est motivé : elles se
  dérivent du système de fichiers, donc elles attrapent l'écran écrit demain
  que personne n'aura pensé à tester. La démonstration que les deux formes sont
  complémentaires est chiffrée — sabotage de la **seule** vue expirée, import
  laissé en place : la garde textuelle serait restée **verte**, le test de
  rendu rend **1 rouge / 3 verts** en désignant la vue exacte.

#### Ce que `chantier/solde-bugs` OUVRE à son tour

- **✅ CLOS (2026-08-04, `chantier/deux-derniers-ouverts`) — les dix-neuf
  compteurs passent par `observerPressionIp`.** Le compte exact est **19**, pas
  « une vingtaine » : mesuré. Un **helper** plutôt que dix-neuf
  transformations — le motif faisait six lignes réparties dans douze fichiers,
  et c'est précisément cette dispersion qui les avait désynchronisées.
  `observerPressionIp` n'est pas plus court, il est **impossible à oublier à
  moitié** : on ne peut pas l'appeler en sautant le suffixe d'événement, donc
  un vingtième compteur écrit demain obtient la règle sans qu'on ait à y
  penser. **La migration est invisible en supervision** — quand l'IP est
  mesurée, la clé produite est identique au caractère près ; seul le trafic
  auparavant versé dans `…:unknown` change de série.

  **Neuf sites ne sont délibérément PAS migrés** : ce sont des `rateLimit`,
  donc des **refus**, et ADR-032 interdit qu'une clé partagée en porte un.

  **L'obstacle documenté était réel et plus petit qu'annoncé** : 79 tests dans
  11 fichiers, chiffre désormais mesuré. Huit venaient de mocks ne fournissant
  que `clientIpFromHeaders` (ils délèguent maintenant au module réel) ; trois
  étaient des gardes dont la **regex** avait vieilli, pas la garantie — elles
  vérifient toujours qu'une clé partagée va vers un compteur et jamais vers un
  refus, et le vérifient **mieux**.

  **Le contrôle négatif a trouvé un trou que la relecture n'aurait pas vu** :
  étiquetage du helper neutralisé → **210 verts, 0 rouge**. Dix-neuf sites
  venaient d'être migrés vers une fonction concentrant la règle de tout le
  dépôt, et **rien ne la testait**. `observer-pression-ip.test.ts` ajouté ;
  même sabotage rejoué → **1 rouge / 5 verts**, nommant `unknown` au lieu de
  `ip-non-mesuree`.

- **~~OUVERT~~ (fermé ci-dessus) — la vingtaine d'autres `observeSharedKey` clés sur l'IP retombaient
  toujours dans le seau agrégé `…:unknown`.** Quiz, calendrier, jackpot,
  fidélité, parrainage, événement, pronostics, skill, play,
  méta-progression : seuls les deux compteurs chasse passent par
  `pressionParIp`, les autres concatènent encore l'IP brute. **C'est écrit
  dans le docstring de `pressionParIp` plutôt que présenté comme une garde
  transverse**, précisément pour ne pas laisser croire au lecteur que le
  problème est clos partout. Les migrer casserait au passage plusieurs gardes
  **textuelles** existantes (`quiz.test.ts`, `calendar.test.ts`,
  `referral.test.ts` matchent la source à la regex) — c'est un chantier, pas
  une ligne.

- **✅ CLOS (2026-08-04, `chantier/deux-derniers-ouverts`) — la phrase
  d'annulation est RENDUE, plus seulement écrite.** `WheelResult` et
  `ContestResult` sont montés contre des doubles : leur badge ne peut plus
  apparaître sans la phrase qui en dit la cause.

  **Cette dette était une impossibilité, elle est devenue faisable** — son
  motif était « ce dépôt n'a aucun environnement de rendu React », vrai le
  2026-08-03, mort le 2026-08-04 (ADR-076). Ce qui justifiait de ne pas faire
  était devenu ce qui permettait de faire, sans que personne le remarque.

  **La justification d'origine était fausse, et la mesure l'a dit.** Il était
  écrit que la garde textuelle serait aveugle à la disparition de la phrase.
  Mesuré : elle rend 1 rouge / 18 verts. Elle n'est pas aveugle du tout.
  L'écart réel tient à un **autre** sabotage — rendre la phrase *présente mais
  inatteignable* :

  | sabotage | garde textuelle | garde de rendu |
  |---|---|---|
  | phrase **supprimée** | 1 rouge / 18 verts | 2 rouges / 2 verts |
  | phrase **présente mais inatteignable** | **19 verts, 0 rouge** | 2 rouges / 2 verts |

  C'est la frontière qu'ADR-074 énonce, désormais **mesurée sur ce couple
  précis** plutôt que citée. ADR-074, ADR-076.

**Revue sécurité du 2026-08-03 — GO, réserves levées** : 0 CRITIQUE, 0 ÉLEVÉ,
2 MOYEN, 4 FAIBLE, 3 INFO, tous corrigés. **Les deux MOYEN étaient des
conséquences non déclarées de la migration du chantier lui-même**, et méritent
d'être retenus comme motif :

- **La purge RGPD était devenue un annulateur de masse.** `purge_expired_*`
  supprime les lignes joueur sur le **seul critère d'âge**
  (`data_retention_months` vaut `default 12` — ce n'est pas un opt-in, chaque
  organisation purge), les tables de lots cascadent, le nouveau trigger posait
  `cancelled_at`, et une ligne annulée est TERMINÉE au sens de
  `purge_expired_reward_issuances` — donc détruite la nuit même. **Avant la
  migration, cette ligne était protégée à vie.** Corrigé en distinguant la
  cause : la purge ne rend plus une annulation terminale.
- **Le portefeuille et la caisse accusaient le commerçant d'un geste qu'il n'a
  pas fait.** Un motif unique pour trois causes (geste d'entretien, cascade,
  purge) : en mars 2028, un caissier aurait affirmé **au client, en face**, que
  son patron avait supprimé l'opération. Vocabulaire fermé
  (`purged`/`source_deleted`/`merchant`/`null`), ADR-069 — et **non** le
  `cancelled_reason` libre, écarté après vérification parce que c'est du texte
  saisi par le commerçant au formulaire.

**Preuve du lot** : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build
vert (Windows), 162 fichiers / 2795 tests, test:sql 12/12, migrations:check
106 fichiers (head `20260902120000`), test:migrations 9/9, sql:check OK, pgTAP
43 fichiers / 2649 assertions PASS (base vide ET semée), `database.generated.ts`
régénéré en `--local` avec un diff de 0 ligne, `ci.yml` croisé dans les deux
sens (43 fichiers de test sur disque, 43 inscrits, aucun orphelin). **Les E2E
n'ont PAS été exécutés** — ils figent WSL (piège 9 de CLAUDE.md). La branche ne
modifie aucun fichier de `e2e/` et aucun spec n'asserte de texte d'annulation,
mais ce n'est pas une exécution : la CI tranchera. Seul trou du chantier.

**Revue sécurité du second chantier (`chantier/derniers-ouverts`) — GO** :
0 CRITIQUE, 0 ÉLEVÉ, 4 MOYEN, 2 FAIBLE, 3 INFO, **tous corrigés**. Trois
méritent d'être racontés — ce sont les enseignements du chantier, et les trois
portent sur le travail du chantier lui-même, pas sur du code ancien.

- **MOYEN 1 — ADR-069 retournée contre elle-même.** La cause d'annulation se
  **dérivait de `cancelled_reason`**, c'est-à-dire du champ de texte libre que
  cette même ADR disait précisément ne pas publier. Un `editor` qui saisit
  exactement `source purgée` comme motif faisait afficher au client « Personne
  ne l'a annulé » et dire au caissier, **au client en face**, « ce n'est une
  décision de personne — ni la vôtre, ni celle de votre équipe ». Pire, un
  `PATCH` PostgREST direct sur `participations` (l'`owner` a `update` sur
  toutes les colonnes) obtient le même résultat **sans passer par l'audit**.
  Au lieu d'imputer au commerçant un geste automatique, on laissait le
  commerçant imputer à l'automatisme son propre geste. **Fermé par une colonne
  dédiée**, `reward_issuances.cancelled_source`, posée par le seul trigger et
  inatteignable depuis l'application — non par un contrôle, mais par une
  **absence** : `upsert_reward_issuance` ne la nomme ni à l'`insert` ni à
  l'`on conflict`, et la table est révoquée d'`authenticated`. ADR-072.
- **MOYEN 2 — les deux appuis chiffrés du délai de grâce étaient FAUX**, et
  gravés dans un `comment on function`. « La plus longue vie qu'un code puisse
  avoir » citait `contests.code_ttl_seconds ≤ 90 jours` : or cette colonne est
  **nullable** (« null : sans limite »), et les sept familles où la grâce
  décide de quelque chose n'ont **aucune échéance** — leur code ne meurt
  jamais. « Le quart de la plus courte rétention déclarable » citait un
  `<select>` **côté client** ; la frontière serveur accepte `1` mois, ce qui
  aurait fait vivre l'explication **trois fois** plus longtemps que la
  rétention elle-même. Les deux appuis sont **retirés et non réécrits** :
  trois mois est assumé comme **arbitrage produit**, et ce qui est garanti —
  donc énoncé dans le commentaire — est la **borne** `least(3 mois, fenêtre de
  l'organisation)`. ADR-071.
- **MOYEN 4 — ADR-032 citée à contresens.** L'en-tête de `loadHuntStepContext`
  écrivait « l'IP est proscrite par ADR-032 » et concluait de là qu'il n'y
  avait rien à faire. **L'ADR dit l'inverse** : une clé partagée ne porte
  jamais un **refus**, mais elle porte un seau **large et fail-open**, à
  valeur d'observabilité. C'est *refuser* sur l'IP qui est proscrit. Et le
  dépôt implémentait déjà exactement cela **deux fonctions plus loin**
  (`observeSharedKey` + `huntScanIp`). Le raisonnement sautait le terme moyen
  que l'ADR prescrit — et c'est ce saut, répété par quatre chantiers, qui a
  laissé cette page sans aucune mesure. ADR-073.
- **MOYEN 3, consigné avec son motif** : la grâce allait à la cause où
  **personne n'a décidé** (`purged`) et pas à celle où **un humain a décidé**
  (`source_deleted`), qui était détruite la nuit même. Elle est étendue sur un
  motif **factuel** et non d'équité : avant `20260902120000`, les triggers
  étant `insert or update` seulement, la disparition de la source laissait la
  ligne non terminale, donc **jamais purgée — pour les deux causes**.
  L'asymétrie suivait le contour du risque nommé par la revue précédente, pas
  un principe. La règle devient : **le collatéral est gracié, la décision ne
  l'est pas.**

**Preuve du second lot** : typecheck 0, lint 0, casts:check OK, test:casts
4/4, build vert (Windows), **163 fichiers / 2818 tests**, test:sql 12/12,
migrations:check **107 fichiers, head `20260903120000`**, test:migrations 9/9,
sql:check OK, pgTAP **43 fichiers / 2669 assertions PASS, base vide ET
semée**, `database.generated.ts` régénéré en `--local` avec un diff de 0
ligne, `ci.yml` croisé dans les deux sens (43/43, aucun orphelin). **Seul
trou : les E2E n'ont pas été exécutés** — ils figent WSL ; la branche ne
modifie aucun fichier de `e2e/` et aucun spec n'asserte de cause d'annulation
(vérifié par balayage), mais ce n'est pas une exécution. La CI tranchera.

### Entrées antérieures

- **✅ CLOS le 2026-08-01 (commit `9f9cc3f`) — Canal SMS : un paiement à
  notification différée pouvait encaisser sans jamais créditer.** Le
  webhook Stripe (`route.ts:174-181`) n'écoutait que
  `checkout.session.completed` ; `checkout.session.async_payment_succeeded`
  n'avait aucune branche. `createSmsCreditCheckoutSession` ne fixe pas
  `payment_method_types` (hérité du tableau de bord Stripe) : si
  SEPA/virement/Bancontact sont actifs, `completed` arrive avec
  `payment_status='unpaid'` (aucun crédit, correct) puis
  `async_payment_succeeded` arrive 2 à 5 jours plus tard et tombait dans la
  branche par défaut, acquittée sans rien faire. **Corrigé** : le webhook
  route désormais les trois événements de checkout par un chemin unique —
  `async_payment_succeeded` crédite, `async_payment_failed` laisse une
  alerte et une trace d'audit chez le commerçant au lieu du silence.
  `readSmsCreditPurchase` croise en plus `client_reference_id` et
  `metadata.organization_id` : une divergence entre les deux vaut refus et
  alerte plutôt qu'un crédit posé sur la mauvaise organisation. S'appuie
  sur l'index d'idempotence livré pour le finding ÉLEVÉ précédent (ADR-059).
  Contrôle négatif joué : case `async_payment_succeeded` retirée du switch
  → 1 test rouge ; restauré → vert.
- **✅ CLOS le 2026-08-01 (commit `088daf2`) — Canal SMS : un worker de cron
  tué après réservation consommait des crédits sans envoyer ni rembourser
  (préexistant, rendu atteignable par ce chantier).** `claim_sms_delivery`
  débite au moment de la réservation ; le verrou de job expire à 120 s
  (`20260722100000_jobs_queue.sql`) alors que la fenêtre de péremption par
  défaut de la réclamation était de 900 s. Si le processus était tué après
  le débit et avant l'envoi, `requeue_stale_jobs` relançait le job au bout
  de 120 s, mais `claim_sms_delivery` voyait la ligne `sending` encore
  fraîche et rendait `false` ; `processSmsSendJob` traitait ce refus comme
  normal et clôturait le job sans rembourser. **Corrigé** :
  `processSmsSendJob` passe désormais `p_stale_after_seconds = 120` à
  `claim_sms_delivery`, aligné sur le verrou réel de `claim_jobs` (le
  `maxDuration` de la route est 60 s, inférieur au verrou de 120 s — un
  worker vivant ne peut donc pas être préempté à tort ; l'argument est
  écrit dans le commentaire de la constante). Contrôle négatif joué :
  paramètre de fenêtre retiré → 2 tests rouges ; restauré → vert.
- **✅ CLOS le 2026-08-01 — Canal SMS : quatre résidus trouvés par une
  contre-revue des quatre correctifs du tour 2, les quatre désormais CLOS
  (trois au troisième tour, le dernier — (F) — au quatrième, branche
  `feat/canal-sms-utilisable`)**. Chacun tenait sur du code lu, pas
  supposé.
  - **(A) ✅ CLOS (migration `20260829120000`, commit `301d04f`)** — la
    ressemblance affichée au back-office ne bloquait rien : un propriétaire
    sanctionné qui redemandait sous un **autre** nom passait le signal.
    `declare_sms_sender` refuse désormais tant que l'**organisation** porte
    une ligne `suspended` (retirée ou non) — le prédicat ne nomme pas
    l'expéditeur visé, il porte sur le droit d'émettre. Ferme à la fois la
    réouverture du même nom (déjà close au tour 2) et ce contournement par
    changement de nom. `retired_at` n'est délibérément pas filtré : un
    retrait conserve le statut `suspended`, donc « je retire le sanctionné
    et j'en déclare un autre » reste refusé. Seule sortie : un
    `set_sms_sender_status` explicite vers `pending`/`rejected`, tracé et
    motivé.
  - **(B) ✅ CLOS (commit `5bfe506`)** — un expéditeur `suspended` puis
    `retired` redevenait invisible comme sanctionné sur les deux écrans, et
    la demande du propriétaire (refusée en base par le correctif (A))
    devenait un no-op muet : « aucun expéditeur demandé » côté commerçant,
    « retiré » côté back-office. Règle « suspendu puis retiré reste une
    suspension » posée dans un module pur (`src/lib/sms-sender-state.ts`),
    lu par les deux écrans. Côté commerçant : la ligne sanctionnée reste
    affichée, un bandeau dit que la suspension porte sur l'établissement et
    non sur un nom, le refus est rendu **avant** la base avec le nom du
    support à contacter. Bouton laissé actif — le désactiver aurait recréé
    un second clic mort pour un propriétaire dont la sanction vient d'être
    levée.
  - **(D) ✅ CLOS (commit `05754be`)** — conséquence directe de l'index
    d'idempotence du tour 2 : `credit_sms_balance` rend l'entrée déjà
    existante sur conflit, mais les deux appelants (back-office, webhook
    Stripe) lisaient ce retour comme une création — un opérateur qui
    recliquait voyait « crédit effectué » deux fois, et `admin_audit_logs`
    (impurgeable) l'affirmait pour un grand livre qui n'en portait qu'une.
    `credit_sms_balance` rend désormais `(entry_id uuid, created boolean)`,
    lu par les deux appelants ; le nom de l'action d'audit change
    (`.duplicate`/`.replayed`) plutôt qu'un champ dans la charge utile, et
    l'écran back-office affiche désormais « déjà crédité sous cette
    référence » en ambre plutôt qu'en vert. Effet de bord assumé et rendu
    visible : deux crédits *délibérés* sous la même référence ne comptent
    plus que pour un — l'écran le dit et invite à changer la référence.
  - **(F) PARTIELLEMENT TRAITÉ, question produit ouverte** — la fenêtre
    horaire légale existe désormais (`src/lib/sms-window.ts`, commit
    `05754be`) et s'applique dans le worker **avant** `claim_sms_delivery`,
    donc avant tout débit : 8h-22h heure de Paris, jamais le dimanche ni un
    jour férié, rendu `retry` et jamais `failed`. Mais elle s'applique
    **sans distinction de nature du message** — un code de retrait de gain
    (SMS que le joueur attend, sans contenu promotionnel) est retardé
    exactement comme un SMS publicitaire. Reclasser ce message en
    **transactionnel** est défendable (le joueur l'a demandé en jouant,
    aucune promotion n'y figure) et l'affranchirait de la fenêtre — ~~**c'est
    une décision du client, non tranchée ici.**~~ **TRANCHÉ le 2026-08-01 :
    le client a décidé d'appliquer.** `enqueuePrizeRedeemSms` passe
    `marketing: false` ; la mention STOP est **conservée** dans le contenu
    bien qu'aucune garde ne l'exige plus, le consentement reste exigé
    inchangé, et le message type mesure **un segment GSM-7**. Garde nommée
    dans `sms-prize.test.ts`, motif complet en ADR-061.

- **✅ CLOS le 2026-07-30 — `BORNE 2` étendue au calendrier et au quiz**
  (migration `20260811120000_borne2_calendar_quiz.sql`, garde
  `supabase/tests/spin_grant_bounds.test.sql` qui couvre **les quatre**
  familles). *Cette entrée est restée marquée « OUVERT » après le correctif :
  elle décrivait un trou déjà bouché.* Le texte d'origine est conservé
  ci-dessous parce que le raisonnement vaut — c'est lui qui a permis de trancher
  — mais **l'état est faux et c'est la ligne que voici qui fait foi**. La règle
  du projet s'applique à ce fichier comme au reste : un document qui garde ses
  alertes après leur correction finit par n'être plus lu.

- **~~🔴 OUVERT — `BORNE 2` absente du tour offert du CALENDRIER et du QUIZ~~ —
  CORRIGÉ, voir ci-dessus
  (2026-07-29)** — `20260725200000_loyalty_spin_bounds.sql` a institué la règle
  « un tour offert ne tire JAMAIS un lot à stock illimité », et en donne la
  raison : la roue PUBLIQUE accepte l'illimité parce qu'elle est bornée ailleurs
  (`play_limit`, statut et dates de campagne, Turnstile, seaux de spin) ; le
  tour offert n'a **aucune** de ces bornes — c'est sa raison d'être. Il exige
  donc un stock RÉEL, dont le décrément atomique compte ce qu'il peut coûter.

  La fidélité et le parrainage portent cette borne. `consume_calendar_spin_grant`
  (`20260728120000`) et `consume_quiz_spin_grant` (`20260803120000`), **écrites
  après**, filtrent `(is_losing or stock is null or stock > 0)` : elles tirent
  les lots illimités.

  **Non corrigé délibérément.** Le correctif est d'une ligne, mais il change le
  comportement de commerçants en production : une case de calendrier ou un quiz
  dont la roue ne porte que des lots illimités cesserait de distribuer
  (`no_prize`, jeton conservé). Ça mérite sa propre preuve et sa propre
  décision, pas un passage en force dans un lot qui traite autre chose.

  **À vérifier avant de trancher** : de combien de grants ces deux modules
  peuvent-ils émettre ? Le quiz impose un `reward_stock` fini (ADR-031), ce qui
  borne déjà l'exposition — la borne manquante serait alors une défense en
  profondeur, pas un trou béant. La fidélité, elle, avait les deux.

- **~~Le tour offert du parrainage ne peut rien faire gagner~~ — HYPOTHÈSE
  INFIRMÉE PAR MOI-MÊME, conservée pour la trace (2026-07-29)** — un audit avait
  signalé que le parrainage, seul des quatre modules, excluait les lots à stock
  illimité, rendant son tour offert systématiquement perdant sur une campagne à
  lots par défaut. J'ai écrit le correctif. **Il aurait rouvert `BORNE 2`**,
  c'est-à-dire une fabrique de codes de retrait sans plafond.

  L'erreur : j'avais comparé les quatre RPC en lisant leur définition **dans la
  migration qui les crée**. Or `consume_loyalty_spin_grant` est redéfinie par
  `20260725200000`. La « divergence » du parrainage était une lecture périmée.

  **Règle qui en découle, et qui a déjà coûté deux fois dans la même journée**
  (l'autre est l'escalade de privilège caissier ci-dessus) : une policy ou une
  fonction se lit dans le **catalogue vivant** — `pg_proc.prosrc`,
  `pg_get_constraintdef` — jamais dans la migration d'origine. Contrôle
  mécanique : `grep -l "function public.<nom>" supabase/migrations/*.sql` doit
  rendre **un seul** fichier ; plusieurs signalent une redéfinition.

  Ce qui reste vrai de l'audit : aucun test du parrainage ne verrouillait
  `BORNE 2`. C'est précisément ce silence qui a rendu l'erreur possible — le
  test existe désormais (`no_prize`, et le jeton **n'est pas** consommé).

- **✅ ESCALADE DE PRIVILÈGE — un caissier pouvait créer campagnes, roues et
  lots (2026-07-29, migration `20260808120000`)** — introduite par la PR #36
  elle-même. En rendant la création transactionnelle, elle a déplacé trois
  écritures du client de session vers une RPC `security definer`, dont la garde
  était `is_org_member`. L'en-tête de la migration justifiait ce choix ainsi :
  « c'est délibérément le MÊME prédicat que la policy RLS *campaigns: all
  membres* (00001:164-166) […] exiger `is_org_editor` aurait RESTREINT un droit
  existant ».

  **Le raisonnement était juste dans sa forme et faux dans son fait** : la
  policy citée n'existe plus. `00019_atomic_security_sessions_timezone.sql:66-88`
  l'a supprimée et remplacée par « campaigns/wheels/prizes: editors », toutes en
  `is_org_editor` — lequel exclut `cashier`. La fonction était donc strictement
  PLUS LARGE que la RLS qu'elle court-circuitait : un employé saisonnier sur un
  poste de caisse partagé pouvait créer des campagnes avec libellés, couleurs et
  probabilités sous son contrôle. Avant la PR #36, la RLS refusait les trois
  écritures.

  **Pourquoi rien ne l'a attrapé** : `campaign_creation.test.sql` ne créait
  qu'une fixture `owner` et gravait l'erreur dans son propre en-tête (« le
  contrôle d'accès rejoue EXACTEMENT la policy RLS (is_org_member) »). Aucun cas
  caissier n'était joué. Corrigé : garde `is_org_editor`, contrôle de rôle en
  défense en profondeur dans `createCampaign`, et deux contrôles négatifs — le
  caissier est refusé, **l'éditeur passe** (une garde trop étroite casserait le
  produit aussi sûrement qu'une garde trop large l'ouvrait).

  **La leçon, plus utile que le correctif** : une fonction `security definer`
  qui prétend « rejouer la policy » ne dit vrai que si la policy citée est la
  policy VIVANTE. Lire le prédicat dans la migration qui l'a créée, sans
  vérifier qu'aucune migration ultérieure ne l'a remplacée, revient à rejouer un
  état historique.

- **✅ La suite pgTAP ne tenait que sur une base VIDE — cinq assertions
  (2026-07-29)** — `meta_progression` (2), `hunts` (1) et `experience_analytics`
  (2) échouaient dès qu'un seed était chargé, et personne ne le voyait : la CI
  jouait pgTAP **avant** le seed, qui n'arrivait qu'au job E2E. Le vert ne
  tenait qu'à l'ordre des jobs — et tout développeur semant sa base locale
  obtenait cinq rouges sans cause visible.

  Deux causes distinctes. Trois assertions comptaient **globalement**
  (`count(*) from reward_issuances`, `from participations`, `from hunt_steps`) :
  leur invariant n'était démontré que sur une base vierge. Bornées à leur
  organisation, elles disent la même chose **en plus fort** — c'est bien CE
  parcours qui n'émet rien, quel que soit le reste de la base. Les deux autres
  partageaient par **collision fortuite** le `player_key` `repeat('9', 64)` avec
  une fixture E2E de `supabase/seed.sql:438`, dans une autre organisation.

  Le correctif structurel n'est pas dans les tests mais dans la CI : elle sème
  désormais **avant** pgTAP. « La suite est indépendante des données
  préexistantes » passe d'accident à propriété vérifiée à chaque passage.

- **✅ Une roue de défi dupliquée devenait injouable (2026-07-29)** —
  `duplicateCampaign` recopiait `game_type` mais **pas** `skill_config`, qui
  porte le secret du jeu. La copie s'annonçait « Mot mystère » au dashboard et
  répondait « Ce défi n'est pas disponible » au joueur, sans aucun message au
  commerçant. Le chemin frère (`campaign-templates`) refuse explicitement cet
  état ; la duplication le fabriquait. La même boucle perdait aussi
  `cost_cents`, `value_cents` et `low_stock_threshold` des lots — la copie
  arrivait avec une marge nulle.

  **Le compilateur ne pouvait pas le voir** : l'interface `Wheel` de
  `src/types/database.ts` omettait `skill_config`. Un type qui ment sur sa table
  ne protège de rien ; la colonne y est désormais.

- **✅ Un job de newsletter zombie renvoyait toute la newsletter (2026-07-29)** —
  la garde anti-rejeu n'acceptait que `completed` et `partial`, or l'état laissé
  par un worker mort en plein envoi est précisément `sending`, et
  `requeue_stale_jobs()` relance ces jobs : le rejeu est un chemin nominal.
  Sur 900 abonnés (9 lots de 100) avec `maxDuration = 60 s`, la fonction est
  coupée en cours de route ; au tick suivant, `org_segment_emails` renvoyait les
  mêmes 900 adresses et les premiers servis recevaient l'email **une seconde
  fois**.

  Corrigé par un journal **par destinataire** dans `email_log`
  (`dedup_key = newsletter:<campagne>:<abonné>`), réutilisant la table et la
  contrainte d'unicité déjà employées par les automatisations — le job devient
  réellement **reprenable** au lieu de choisir entre tout renvoyer et tout
  abandonner. `sendNewsletterEmails` retourne désormais la liste des
  destinataires servis, et le compte affiché au commerçant couvre toute la
  campagne, pas le seul reliquat.

- **✅ Aucun échec d'envoi d'email n'atteignait Sentry (2026-07-29)** —
  `src/lib/resend.ts` ne journalisait qu'en `console.error` : une panne de
  domaine ou un compte Resend en mode test faisait disparaître en silence les
  emails de gain, de code de chasse et de rappel. Vingt appels convertis en
  `reportError`.

- **✅ Création de campagne — plus de campagne sans roue (2026-07-29, PR #36)** —
  `createCampaign` enchaînait **trois écritures séparées** (campagne, roue, lots
  par défaut) sans transaction ni rattrapage. Un échec au milieu laissait une
  campagne **sans roue, donc injouable**, et le message d'erreur l'avouait au
  commerçant : « Campagne créée mais roue manquante » — à lui de la retrouver
  et de la supprimer. Corrigé par la RPC transactionnelle
  `create_campaign_with_defaults` (migration `20260806120000`).

  **Le correctif existait depuis le 2026-07-09** sur la branche
  `claude/saas-security-audit-8z3zvv`, conservée jusqu'ici pour ce seul
  artefact. **L'adopter tel quel aurait régressé le produit** : il codait les
  lots par défaut EN DUR dans le SQL — seconde source de vérité condamnée à
  diverger de `DEFAULT_PRIZES` — et ignorait le préréglage « kermesse » posé
  depuis sur la roue. La version livrée prend le style et les lots en
  **paramètres JSON** : Postgres apporte l'atomicité, TypeScript reste la
  source. La branche a été supprimée, sa raison d'être ayant disparu.

  **Contrôle d'accès vérifié avant écriture** : la policy RLS
  `campaigns: all membres` exige `is_org_member`. Exiger `is_org_editor` aurait
  **restreint** un droit existant, un simple contrôle d'authentification
  l'aurait **élargi**. La fonction rejoue le prédicat à l'identique — règle à
  tenir dès qu'un `security definer` court-circuite la RLS.

  Preuve : `campaign_creation.test.sql`, **13 assertions**, dont le refus
  inter-organisation et surtout **aucune campagne orpheline après un refus**.
  Suite pgTAP complète **23 fichiers / 1848 assertions** (22 / 1835 avant).

- **✅ Onze fichiers de `src/actions/` n'envoyaient rien à Sentry (2026-07-29,
  PR #35)** — 60 `console.error` convertis en `reportError`. Ces chemins —
  création de campagne, encaissement en caisse, authentification, webhooks —
  laissaient une ligne dans les journaux Vercel et **rien dans Sentry**.

  **Durcissement né de ce chantier** : PostgreSQL cite la valeur en cause sur
  violation d'unicité (« Key (code)=(GAIN-ABCD2345) already exists »). Un code
  de retrait est un **secret porteur** — qui le détient encaisse le lot. Il
  partait déjà dans les journaux Vercel, mais la conversion **élargissait
  l'exposition à Sentry**. `sentry-scrub.ts` expurge désormais les neuf
  familles. Le motif porte sur la **forme du code** et non sur le nom de la
  clé, parce que `code` doit rester lisible (SQLSTATE, `error.code`) ; les
  codes **nus** de 8 caractères sont volontairement hors motif, indiscernables
  d'un identifiant technique.

- **~~Onze fichiers sans `reportError`~~ et ~~création de campagne non
  transactionnelle~~ — DEUX ENTRÉES PÉRIMÉES SUPPRIMÉES (2026-07-29)** — les
  deux décrivaient comme ouvert un défaut corrigé et listé « ✅ » quelques
  lignes plus haut dans ce même fichier. Vérifié dans le code : les onze
  fichiers portent tous `reportError` (PR #35), et
  `create_campaign_with_defaults` est livré (migration `20260806120000`,
  PR #36), appelé par `src/actions/campaigns.ts`, couvert par
  `campaign_creation.test.sql`.

  **Ce que ces doublons coûtaient, concrètement** : la seconde entrée envoyait
  chercher un correctif sur la branche `claude/saas-security-audit-8z3zvv`, qui
  n'existe plus — et prévenait d'une collision de numéro avec
  `00005_security_hardening.sql`, piège pour une migration qui porte en réalité
  `20260806120000`. Un lecteur suivant ces instructions réécrivait la RPC et
  recréait la seconde source de vérité (lots par défaut codés en dur en SQL) que
  la version livrée évite justement.

  **Règle qui en découle** : une entrée passée en « ✅ » se SUPPRIME de la
  liste des défauts ouverts ; la garder « pour l'historique » quinze lignes
  plus bas fabrique un backlog qui se contredit.
- **✅ TRAITÉ SUR TOUT LE PÉRIMÈTRE EXPOSÉ — le formulaire reste figé après une
  action qui a pourtant abouti (2026-07-28/29)** — les **86 composants** du
  projet utilisant `useActionState` ou `useTransition` ont été classés un par
  un, en ouvrant **la fonction exacte** de chaque Server Action appelée (pas le
  module) pour vérifier si elle revalide et si elle redirige :

  | Cat. | Nb | Décision | Motif |
  |---|---|---|---|
  | **A** | 23 | migrés vers `useActionForm` | action `(prev, FormData)` qui revalide sans rediriger — le profil exact du défaut |
  | **C** | 5 | migrés au patron manuel | action à objet typé sous `useTransition` (dont les deux fichiers **joueur** `contest-experience`, `contest-leagues`) |
  | **B** | 13 | **non migrés** | le succès finit par `redirect()` : la navigation rend le `pending` sans objet, et l'appel impératif ferait passer le `NEXT_REDIRECT` par le `catch` du hook → faux message d'erreur |
  | **D** | 5 | **non migrés** | aucune action appelée ne revalide (`auth`, `billing`, `play`, `skill`, `preview`) — sans revalidation, pas de défaut |
  | **E** | 10 | **non migrés** | cas mixtes : une seule action B suffit à disqualifier la migration mécanique (`merchant-controls` a un `deleteMerchant` qui redirige ; les gros éditeurs ont leurs propres machines d'état) |

  Plus les 14 fichiers du premier lot (caisse ×9, `contest-settings` ×12
  actions, progression ×2, newsletter). Correctif factorisé dans
  [`src/lib/use-action-form.ts`](../src/lib/use-action-form.ts).

  **Leçon de méthode — deux fichiers à moitié migrés** ont été laissés par des
  agents interrompus en cours d'écriture : `wheel-style-editor.tsx` (import du
  hook posé, `useActionState` et liaison `action=` restants) et
  `webhook-form.tsx` (hook posé, JSX référençant encore `retryPending` /
  `retryState`). **Un audit par `grep` n'a vu que le premier ; c'est `tsc` qui a
  attrapé le second.** Sur un balayage massif, la vérification statique par
  motif ne suffit pas — seul le typecheck ferme la porte.

  **Décisions de comportement assumées** : le repli `<noscript>` de
  `notify-win-toggle` et `reengage-toggle` est **retiré** (sans attribut
  `action`, il était mort au mieux, et dégénérait en navigation GET au pire) ;
  `resetOnSuccess` ajouté à `contest-questions` pour préserver le vidage d'un
  champ non contrôlé que le reset automatique de React 19 assurait ;
  `router.refresh()` nouveau sur `referral-program-settings`.

  Validation : typecheck 0, lint 0, **1423 tests unitaires**, build OK, et la
  **suite E2E complète à 119 passés / 1 échec** — cet échec étant le flaky du
  jeu de révélation décrit à l'entrée suivante, **formellement disjoint** de la
  migration (le parcours `/play/[slug]` n'importe que des composants
  `@/components/wheel/*`, dont aucun n'est dans le diff).

- **✅ Jeux de révélation — la reprise d'un gain écrasait la partie en cours
  (trouvé, corrigé et prouvé le 2026-07-29)** — **UN SEUL fichier,
  `src/components/wheel/game-shell.tsx`, donc les treize jeux d'un coup.**

  **⚠️ Une première explication publiée ici était FAUSSE** et est conservée
  plus bas pour mémoire : « le premier tap est traité deux fois ». L'
  instrumentation du DOM l'a infirmée — un écouteur en phase de capture n'a
  enregistré **qu'un seul clic** (`isTrusted=true`), et la phase « playing »
  n'a **jamais** été atteinte. La leçon vaut d'être gardée : deux signatures
  d'échec distinctes semblaient exiger une explication à deux temps, alors
  qu'une cause unique les produisait toutes les deux.

  **Cause réelle** : l'effet de reprise d'un gain non réclamé
  (`prepareAnonymousPlayer()` → `recoverPendingWin(slug)`) est une chaîne
  **asynchrone à deux allers-retours serveur**. Elle peut aboutir APRÈS que le
  joueur a lancé sa partie, et son `setPhase("won")` écrasait alors la phase
  « playing » que `handleStart` venait de poser. Le joueur — celui qui tape dès
  que la page devient interactive — **sautait directement à l'écran gagné, sans
  l'animation de révélation**, c'est-à-dire sans le jeu, qui est tout ce que ces
  mécaniques vendent. Cela explique les deux signatures : l'en-tête
  « Découvrez votre résultat » n'apparaît jamais (A) et le bouton de révélation
  reste introuvable (B) — dans les deux cas parce qu'on est déjà en phase
  « won ».

  **Correctif** : un `startedRef` posé **avant** l'aller-retour serveur ; la
  reprise ne peut plus écraser une partie engagée. Second geste indissociable —
  le gain récupéré est mémorisé dans `pendingWinRef` et affiché si le tirage
  est refusé *parce que* ce lot existe déjà : sans lui, la garde aurait créé un
  défaut symétrique, opposer un écran bloqué à un joueur qui a justement un lot
  à réclamer.

  **Preuve** : **20 essais instrumentés sans anomalie**, là où elle tombait dès
  le 1ᵉʳ essai ; `player-win.spec.ts` complet vert sur 4 passages consécutifs.

- **~~🟡 Jeux de révélation — « le premier tap est traité deux fois »~~ —
  HYPOTHÈSE INFIRMÉE, conservée pour la trace (2026-07-29)** — le raisonnement
  était cohérent (l'`aria-label` du bouton de révélation bascule bien en
  « Carte retournée », `flip-card-reveal.tsx:88`) mais **faux** : aucun second
  clic n'existe. Corrigé par l'entrée ci-dessus. Ce qui reste vrai et utile :
  deux composants distincts exposent le même nom accessible « Retourner la
  carte », ce qui rend les sélecteurs E2E ambigus par construction — sans
  conséquence utilisateur connue.

- **~~CORRIGÉ SUR LA NEWSLETTER~~ — premier lot, conservé pour l'historique
  (2026-07-28)** — **corrigé pour la newsletter** (`8c5eb56`) : l'état de
  chargement ne dépend plus de
  `useActionState`. L'action est appelée comme une simple fonction asynchrone
  et l'état retombe dans un `finally` ; la promesse se résout à la réponse
  HTTP, indépendamment du rendu, donc **le message de prise en compte
  s'affiche toujours**. Un `catch` couvre en plus la coupure réseau, où
  l'écran restait tout aussi muet. **Preuve : 25 essais consécutifs sans
  reproduction**, là où le défaut tombait aux essais 2/12, 7/12 et 9/15 —
  soit ~3,5 % de chance que ce soit un hasard. Spec E2E complet vert.

  **✅ LES TROIS FORMULAIRES SONT TRAITÉS — vérifié dans le code le
  2026-07-31.** Cette ligne annonçait « TROIS FORMULAIRES RESTENT EXPOSÉS »
  (clôture de pronostics, encaissement en caisse, clôture de saison de
  progression). Les trois sont passés à `useActionForm` par le second tour
  (PR #52→#59) : `redeem-button.tsx:23` — qui porte même le commentaire
  expliquant que c'est là que le défaut faisait le plus de dégâts —,
  `contest-settings.tsx:89-91`, et `progression-new-season.tsx:16`.

  **Ce qui vaut d'être retenu n'est pas le correctif mais le retard de cette
  ligne** : elle est restée fausse trois jours après avoir cessé d'être vraie,
  et elle désignait la CAISSE — l'écran le plus sensible du produit. Un
  document qui décrit un danger éteint dépense la vigilance de son lecteur au
  mauvais endroit ; à la longue il apprend à ne plus le croire. Une entrée qui
  annonce un reste-à-faire doit être rouverte au moment où ce reste est fait,
  pas quand quelqu'un repasse par hasard.

  Contrepartie assumée du patron : le formulaire n'est plus soumissible sans
  JavaScript. Sur ces écrans il ne l'était déjà qu'à moitié (les sélecteurs
  sont des états client).

  Description d'origine, conservée pour le diagnostic :

  Un commerçant envoie sa
  newsletter ; **l'envoi part réellement** (campagne en base au statut
  `queued`, travaux en file), mais son bouton reste bloqué sur « Envoi en
  cours… » **indéfiniment**, sans message d'erreur. Il conclura que ça n'a pas
  marché et **renverra**.

  **Reproduit en local trois fois de façon indépendante** — essais 2/12, 7/12
  et 9/15, soit **environ un envoi sur huit** — sur `main` sans modification,
  avec **React 19.2.8 et Next 16.2.12, les versions les plus récentes
  publiées**. Harnais de reproduction : boucle Playwright + purge du seau de
  rate-limit entre chaque essai (le seau d'envoi est de 5/jour et masquerait
  le défaut au 6ᵉ tour).

  **Signature mesurée** (identique en CI et en local) :

  | Fait | Valeur |
  |---|---|
  | POST de l'action | **200 OK en 0,4 à 0,9 s**, charge RSC complète |
  | Effet serveur | **appliqué** — ligne `newsletter_campaigns` en `queued`, travaux en file |
  | Réseau après la réponse | **aucune requête pendant 30 s** |
  | État client | `pending` de `useActionState` **jamais résolu** ; ni message de succès, ni `FieldError` |

  **Cinq causes écartées PAR LA MESURE, à ne pas refaire** : (1) parallélisme
  CI — `workers: 1` testé, même échec ; (2) limites de débit par IP — aucune
  requête refusée ; (3) nonce CSP différent entre document et réponse d'action
  — les chunks concernés étaient déjà chargés ; (4) préchargement de la
  navigation — `prefetch={false}` testé, le défaut persiste ; (5) proxy TLS du
  harnais E2E — **reproduit en HTTP direct, sans proxy**.

  **Cause : comportement connu en amont.** L'action se résout *très vite*, le
  réconciliateur React marque la frontière comme suspendue et ne rejoue jamais
  la mise à jour, bien que les données soient arrivées — d'où le caractère
  intermittent (course). Discussions : vercel/next.js
  [#82289](https://github.com/vercel/next.js/discussions/82289),
  [#88767](https://github.com/vercel/next.js/discussions/88767), et l'issue
  [#58772](https://github.com/vercel/next.js/issues/58772) sur
  `revalidatePath` cassant `useFormStatus`/`useFormState`. **Monter de version
  ne suffira pas : nous sommes déjà sur les dernières.**

  **Portée à vérifier avant correctif** : toute action de back-office qui
  appelle `revalidatePath` puis renvoie un état lu par `useActionState`. Les
  specs E2E tombés désignent au moins la newsletter, la clôture de pronostics,
  l'encaissement en caisse et la clôture de saison de progression.

  **Pistes de correctif, aucune encore appliquée ni mesurée** : sortir la
  revalidation de l'action et déclencher `router.refresh()` côté client une
  fois l'action résolue ; ou tenir un état de chargement propre à côté de
  `useActionState`. Le harnais de reproduction permet de PROUVER un correctif
  (15 essais sans reproduction contre ~1/8 aujourd'hui) — ne rien livrer sans
  cette mesure.

- **~~EN COURS D'INVESTIGATION~~ — élément de l'enquête ci-dessus, conservé
  pour la trace des mesures (2026-07-28)** — ce qui était **établi** dès la
  trace réseau du run 30360334558 (`newsletter:24`, projet desktop-smoke,
  tentative initiale ET reprise) :

  | Fait mesuré | Valeur |
  |---|---|
  | POST de l'action `/dashboard/newsletter` | **200 OK en 651 ms** |
  | Charge utile renvoyée | RSC `text/x-component`, 14 322 octets |
  | Chunks JS référencés par cette charge | **tous déjà chargés (200)** |
  | Activité réseau après la réponse | **aucune pendant 13 s** |
  | État de l'écran à l'expiration | bouton `« Envoi en cours… » [disabled]`, aucune erreur affichée, historique inchangé |

  Autrement dit : **le serveur a répondu correctement et vite, le client avait
  tout ce qu'il lui fallait, et le rendu n'a jamais été commité.** L'action
  appelle `revalidatePath("/dashboard/newsletter")` puis renvoie
  `{ ok: true }` ; `useActionState` reste `pending` indéfiniment, donc le
  bouton reste figé et le message « En file d'attente : envoi à N abonnés »
  (rendu seulement si `state.data` existe) n'apparaît jamais.

  **Deux pistes écartées par la mesure, à ne pas refaire** : (1) les limites
  de débit par IP partagées par toute la CI (`spinIp` 40/min, `cashier`
  30/min) — aucune requête refusée, aucun message de refus ; (2) le nonce CSP,
  différent entre le document (`b24791a5…`) et la réponse de l'action
  (`7ad05bad…`) — séduisant, mais les chunks que la charge référence avaient
  déjà été chargés avec succès.

  **Piste restante, non vérifiée** : une exception au rendu du nouvel arbre,
  avalée sans surcouche d'erreur. Prochain pas : reproduire en local (Docker
  et les trois navigateurs sont désormais disponibles) avec la console du
  navigateur ouverte. **Impact potentiel en PRODUCTION** : ce n'est pas un
  défaut de test — un commerçant verrait le même formulaire figé après un
  envoi pourtant parti.

- **~~CAUSE TROUVÉE~~ — HYPOTHÈSE INFIRMÉE : famine de ressources en CI
  (2026-07-28)** — corrigée le jour même. Le raisonnement était cohérent mais
  faux : `workers: 1` a été poussé puis **retiré** après mesure — les mêmes
  specs sont retombés avec un seul navigateur, et le job n'a gagné que deux
  minutes. Conservé ici comme trace de ce qui a été exclu. L'entrée ci-dessous
  décrivait
  `progression.spec.ts` comme un test instable isolé. **C'était une
  sous-estimation** : sur les six derniers pushes de `main`, trois runs sont
  tombés, sur **six specs distincts** (`progression:220`, `pronostics:93`,
  `pronostics:251`, `newsletter:24`, `player-win:22`, `player-win:147`),
  dont sur des commits **purement documentaires** ou ne touchant que `site/` —
  du code que la suite E2E n'exécute pas.

  **Diagnostic établi sur les traces Playwright** (artefact
  `playwright-traces` du run 30357823320), pas déduit. Les quatre captures
  d'un même run rouge montrent la **même signature** : l'action serveur est
  encore EN VOL au moment où l'assertion expire —
  bouton `« Envoi en cours… » [disabled]` (newsletter),
  bouton `« Clôture… » [disabled]` avec le dialogue de confirmation toujours
  ouvert (pronostics), saison encore `« En cours »` avec son bouton
  `« Clore la saison »` intact (progression). Aucune trace de refus, aucun
  message d'erreur : le serveur n'avait simplement pas fini.

  **Cause** : sur un runner à 4 vCPU tournent en même temps le serveur Next
  de *production*, la pile Supabase Docker (10 conteneurs) et **deux**
  navigateurs Playwright — le défaut de `workers` est `cpus/2`. Les actions
  serveur, qui enchaînent plusieurs allers-retours DB et une revalidation,
  dépassent alors des délais de 15 à 30 s. **`retries: 1` était déjà actif** :
  ces tests ont donc échoué **deux fois de suite**, ce qui écarte l'aléa
  ponctuel et confirme une famine soutenue.

  **Correctif** : `workers: process.env.CI ? 1 : undefined`
  (`playwright.config.ts`). Allonger les délais n'aurait traité que le
  symptôme — et pas pour les assertions déjà à 30 s. Coût assumé : le job E2E
  s'allonge. **À surveiller** : si un run retombe malgré un worker unique, la
  cause est ailleurs et cette entrée doit être rouverte.

- **✅ CAUSE TROUVÉE ET CORRIGÉE — la clôture de saison n'apparaissait pas à
  l'écran une fois sur trois (2026-07-29)** — ce que trois entrées successives
  ci-dessous ont traité comme « un test instable » était **un défaut de
  production**, et le harnais l'a établi en une mesure.

  **Mesure : 8 échecs sur 25 clôtures (32 %), et les 8 avec la clôture
  CORRECTEMENT ENREGISTRÉE EN BASE.** Le réseau est sans ambiguïté : l'action
  répond `200`, puis le rafraîchissement `GET /dashboard/progression?_rsc=`
  répond `200` lui aussi. Les données arrivent ; le client ne les applique pas.
  Troisième manifestation du même défaut amont (vercel/next.js #82289, #88767),
  cette fois sur `router.refresh()` et non sur le `pending` d'une transition.

  **Ce que vivait le commerçant** : il clôt sa saison, l'écran affiche toujours
  « En cours », et le bouton « Clore la saison » l'invite à recommencer — une
  action que l'interface elle-même annonce comme DÉFINITIVE. Une fois sur
  trois.

  **Correctif** (`progression-season-card.tsx`) : le statut atteint est appliqué
  localement dès qu'une transition réussit, sans attendre le retour serveur.
  L'écrasement est **daté par le statut serveur du moment**, donc il cesse de
  s'appliquer de lui-même dès que le serveur bouge — dérivé au rendu, sans
  `setState` dans un effet, donc sans état périmé à nettoyer. Couvre les
  **trois** transitions : lancement, clôture, archivage.

  **Preuve : 25 essais sans échec**, contre 8/25 avant ; spec E2E complet vert
  sur 3 passages consécutifs.

  **Leçon** : ce test a été étiqueté « flaky » pendant trois jours, neutralisé
  puis réactivé, assumé rouge par décision, déclaré éteint à tort. Il disait la
  vérité depuis le début — il manquait un harnais pour l'écouter. Un test
  intermittent qui porte sur un parcours réel mérite qu'on mesure avant de le
  qualifier.

- **🟡 LE HARNAIS DE MESURE A MENTI QUATRE FOIS — et c'est la leçon la plus
  transférable de la journée (2026-07-30)** — quatre campagnes, quatre
  mensonges, dans les deux sens :

  | # | Symptôme | Réalité |
  |---|---|---|
  | 1 | **19 rouges sur 20** | le re-seed ne ROUVRE pas une saison close (`on conflict do nothing`) : dès l'essai 2, le test échouait légitimement |
  | 2 | **6 rouges sur 20** | tous à la connexion — `db reset` recrée la base sous GoTrue, qui garde des connexions mortes |
  | 3 | **22 rouges sur 22** | le harnais n'installait que chromium ; la mesure était lancée sur `mobile-safari` → « Executable doesn't exist » |
  | 4 | **arrêt muet au 5ᵉ essai** | GitHub exécute les `run:` avec `bash -e`, et la garde était écrite sur deux lignes (`cmd` puis `rc=$?`) : **l'étape mourait avant de lire `rc`** |

  **Le n° 4 est le plus insidieux.** Les trois premiers comptaient mal ; celui-ci
  s'arrête sans rien dire. Un harnais qui meurt en silence est pire qu'un
  harnais qui compte mal — on ne sait même pas qu'il a menti. Et la garde
  « essai non compté » qu'il portait depuis sa création était **du code mort**,
  incapable de se déclencher.

  **Trois gardes désormais, une par étage du capteur** : la base (saison semée
  ACTIVE, pas « au moins une saison »), l'authentification (jeton obtenu de
  GoTrue), et le NAVIGATEUR (il doit démarrer). Cette dernière échoue le job au
  lieu d'écarter des essais : un navigateur absent ne se répare pas d'un essai
  à l'autre.

  **Vérifié, pas supposé — et mon premier test du n° 4 était FAUX** : envelopper
  la commande dans `( … ) || echo` désactive `set -e` à l'intérieur, ce qui
  faisait passer l'ancienne forme pour correcte. Refait proprement, sous
  `bash -e` et dans une boucle, la reproduction est exacte.

- **✅ `player-win.spec.ts` — 30 essais, 30 verts. Ce que ça prouve, et ce que
  ça ne prouve PAS (2026-07-30, run `30573408662`)** — après réparation du
  harnais, la mesure tourne enfin. Trente essais comptés, **zéro rouge**.

  **Ce que ça établit** : le taux d'échec du test a chuté nettement. S'il était
  resté à ce qu'on observait (~1 échec sur 6 passages CI), la probabilité de
  trente verts d'affilée serait sous 0,5 %.

  **Ce que ça n'établit pas, et il faut le dire** : *laquelle* des corrections a
  agi. `main` en portait deux qui touchent ce parcours — le rechargement franc
  sur `redeemParticipation` et la peinture du `body`. Et surtout :
  **l'instrumentation n'a jamais eu l'occasion de parler.** Aucun essai n'ayant
  échoué, l'hypothèse de la course d'hydratation sur le champ « panier » reste
  **non confirmée**. Elle reste armée : si le cas se reproduit, le message
  d'échec nommera la valeur du champ au moment du clic.

- **✅ Le réordonnancement écrivait un ordre que PERSONNE n'avait demandé
  (2026-07-30)** — trouvaille classée « génante » par un audit, jamais réfutée,
  et pourtant la seule du lot qui **corrompt une donnée**.

  Les listes réordonnables envoient au serveur l'ORDRE COMPLET, recalculé depuis
  la liste **affichée**. Quand `router.refresh()` ne s'appliquait pas, la liste
  restait périmée — et le clic **suivant** écrivait en base un ordre inventé.
  Sur une chasse au trésor en mode « imposé », l'ordre des étapes *est* le
  parcours.

  **Pas de rechargement franc ici**, contrairement aux créations : on clique ↑↓
  des dizaines de fois. Écrasement local avec l'ordre serveur comme date de
  péremption, **extrait** dans `src/lib/ordre-optimiste.ts` — écrit deux fois
  avant de l'être, et surtout : le projet n'a pas d'environnement de rendu
  React, donc une logique laissée dans un composant est une logique que
  personne ne peut vérifier. Contrôle négatif : sans l'écrasement, le test rend
  `a,c,b,d` — l'ordre corrompu exact.

- **✅ `use-action-form` — les 98 appels ouverts, le défaut NON inversé
  (2026-07-30)** — le hook posait la question dans son propre commentaire :
  « le jour où la population entière aura été ouverte, c'est le défaut qu'il
  faudra inverser ». **Réponse mesurée : non.**

  Le rechargement paierait **100 %** d'un coût pour fermer une fenêtre à 5–32 %.
  Sur la moitié de la population, la défaillance est **invisible par
  construction** — coût plein, gain nul. Il faudrait plus de trente exemptions,
  soit une liste *plus longue* que la liste d'opt-in.

  **Dix-huit appels reçoivent l'option**, dont **neuf que toutes les doctrines
  précédentes auraient manqués : la caisse.** Le risque n'y est pas le doublon —
  la base refuse la seconde remise. C'est le caissier qui, devant un client,
  lit un écran inchangé, reclique, obtient un refus, et **ne donne rien** alors
  que la base compte le lot remis, sans marche arrière.

  **Un défaut vérifié à la main au passage** : `webhookSecret` est une PROP
  SERVEUR. Après régénération sans rafraîchissement, « Afficher » rend
  l'**ancien** secret, que le commerçant recopie dans son système — toutes ses
  signatures échouent ensuite, alors qu'il a tout fait correctement.

  **Garde** : `use-action-form-coverage.test.ts` reconnaît la signature « insère
  une ligne, n'affiche aucun succès ». Elle a trouvé deux sites que l'audit
  n'avait pas nommés. Elle dit explicitement ce qu'elle **ne** couvre pas.

- **✅ L'artefact d'axe sur `/play` — mécanisme MESURÉ, pas déduit
  (2026-07-30)** — une sonde isolée (`scripts/axe-stack-probe.mjs`), sans
  Supabase ni build Next, tranche ce que trois jours d'hypothèses n'avaient pas
  tranché.

  **Le mécanisme n'est pas celui qu'on croyait.** `position: fixed` seul rend
  `incomplete`, jamais de violation. Ce qui casse, c'est **un descendant qui
  crée un contexte d'empilement** — une `opacity: .99` FIGÉE suffit, un
  `transform: translateY(0)` aussi. Ni le dégradé ni l'animation en cours n'y
  sont pour rien.

  **Le correctif choisi par la mesure**, sur quatre candidats :

  | candidat | résultat |
  |---|---|
  | **body peint** | `passes` — blanc sur noir = **21:1** ✅ |
  | shell sorti de `fixed` | `incomplete` — vert **par abstention** |
  | `z-index` sur `<main>` | `incomplete` — vert par abstention |
  | `isolation` / `z-index` sur le shell | aucun effet |

  Les deux qui « passent » rendent le capteur **muet** au lieu de le rendre
  juste. Sans distinguer `passes` de `incomplete`, on livrait un vert qui ne
  vérifie rien. La couleur posée est celle du commerçant, jamais un noir
  statique — qui produirait un faux **rouge** sur les presets clairs.

- **✅ Le plancher d'opacité, relevé trois fois, est RETIRÉ (2026-07-30)** —
  0, puis ~0,72, puis 0,75 : trois relèvements, trois mises en défaut. Par
  l'imbrication (0,75 × 0,75 = 0,5625, sur l'écran de saisie d'e-mail), puis
  par un preset plus clair — à 0,75, `zinc-300` tombe à **4,41:1** et le kicker
  `text-white/60` à **3,17:1**.

  Relever une quatrième fois n'aurait fait que déplacer la limite. Le fondu est
  retiré des quatre animations qui enveloppent du texte (`play-in`,
  `cartoon-pop-in`, `tv-page`, `event-pop`) : **sans opacité, la multiplication
  n'a plus rien à multiplier.** Le `translateY` et le `scale` portaient déjà
  seuls l'arrivée — les commentaires le disaient eux-mêmes.

  La garde structurelle **a immédiatement servi** : elle a attrapé un `opacity`
  qu'une édition scriptée avait manqué dans `cartoon-pop-in`.

  Le kicker passe en jeton plein — c'était le dernier de /play à porter son
  propre alpha, alors que le fichier énonce la règle inverse depuis longtemps.

- **✅ Les couleurs LIBRES sont désormais averties, jamais refusées
  (2026-07-30)** — `playContrastWarning` mesure et donne le chiffre dans
  l'éditeur de style. Aucune palette à deux états ne sauve une demi-teinte
  (`#7a7a7a` est hostile au clair comme au sombre) ; refuser serait décider à la
  place du commerçant sur son propre habillage.

  **Une branche de code MORTE trouvée en l'écrivant** : le message « votre titre
  ressort à X:1 » est inatteignable — le titre blanc n'échoue qu'au-dessus d'une
  luminance de 0,30, mais là la bascule passe à `k-ink`, qui rend au moins
  5,3:1. Remplacée par un balayage de tout le spectre de gris qui l'établit.

- **✅ TRANCHÉ le 2026-07-31 — le mode 2 n'est PAS un défaut de caisse, et le
  test le dit désormais lui-même.** Les trois étages applicatifs ont été
  innocentés en les lisant, pas en les supposant :

  1. **le composant** — `redeem-button.tsx` : le champ est **non contrôlé**
     (ni `value`, ni `defaultValue`), sa valeur vit dans le DOM ;
  2. **le hook** — `use-action-form.ts:93` construit son `FormData` depuis le
     formulaire **au moment du submit**, il ne conserve aucun état intermédiaire ;
  3. **les deux chemins SQL** — le registre universel
     (`redeem_reward_by_code`) passe `p_basket_cents` aux fonctions de famille,
     et le repli legacy (`redeem_by_code`, `20260722150000:110`) écrit
     `participations.basket_cents`, la colonne exacte que relit la caisse. La
     piste « un seul des deux chemins persiste le panier », qui aurait
     élégamment expliqué l'intermittence, est donc **écartée**.

  Or `parseBasketToCents("")` rend `null`. « Remise enregistrée, panier
  absent » ne peut donc signifier qu'une chose : **le champ était vide au
  clic**. La perte est côté client, avant l'envoi.

  **Ce qui a été fait, et ce qui ne l'a pas été.** Le test attend désormais
  l'hydratation avant de saisir — `fill()` seul n'attend que l'actionnabilité
  DOM, or le nœud peut être présent et stable pendant que React n'a pas
  attaché ses gestionnaires. Un caissier met plusieurs secondes à taper un
  montant et ne rencontre jamais cette fenêtre ; Playwright tape en une
  milliseconde et tombe dedans. Et une assertion **échoue maintenant au
  moment du clic**, pas quinze lignes plus bas : un échec sur elle désigne la
  course client, un échec sur celle du panier désigne le serveur. Jusqu'ici
  les deux enquêtes se ressemblaient.

  **Je n'ai PAS reproduit la perte.** Une sonde à deux bras (saisir sans
  attendre / après hydratation) a été écrite et lancée ; l'environnement WSL
  a gelé deux fois sous la charge du build avant de rendre un chiffre, et
  j'ai arrêté là plutôt que d'y passer la soirée. La cause reste donc
  **déduite, pas mesurée** — c'est plus faible, et c'est écrit ici pour que
  personne ne lise « tranché » comme « prouvé ». Ce qui est prouvé, c'est que
  les trois étages applicatifs sont sains ; ce qui est déduit, c'est où la
  valeur se perd.

  *Texte d'origine conservé ci-dessous : le raisonnement par modes reste ce
  qui a permis de séparer les trois causes.*

- **🟠 (historique) `player-win.spec.ts:22` tombe de TROIS façons distinctes
  (2026-07-30)** — ce test
  est consigné comme intermittent depuis trois jours sans qu'on ait jamais dit
  *où* il tombe. Trois modes observés le même jour :

  1. `:33` — violation axe `color-contrast` sur l'écran d'accueil. **Artefact
     de mesure**, tranché par l'artefact CI du run `30548093688` : le shell qui
     peint le fond est `position: fixed` et se fait éjecter de la pile de
     fonds, axe calcule alors sur le crème du site. Aucun joueur touché.
  2. `:76` — `getByText(/panier/)` introuvable après un retrait en caisse.
  3. (antérieur) instabilités de connexion, traitées par le préchauffage du
     harnais de mesure.

  **Le mode 2 mérite mieux qu'un « flaky ».** L'assertion suit un `page.goto`,
  donc une lecture serveur fraîche : « Déjà récupéré » s'affiche — le retrait a
  bien eu lieu — mais pas le panier. Or la garde d'affichage est
  `basket_cents !== null` (`redeem/page.tsx:202`), et **non** un `&&` : un
  panier à zéro s'afficherait quand même. *Hypothèse initiale réfutée en la
  vérifiant.* Donc `basket_cents` vaut réellement `null` : **le champ était
  vide au moment de la soumission**, alors que le test venait de le remplir.

  **Ce que ça pourrait vouloir dire** : une course d'hydratation. La saisie
  atteint le DOM rendu par le serveur, puis React reprend la main et la valeur
  ne suit pas jusqu'à la `FormData`. Si c'est cela, **un caissier qui tape le
  montant du panier dès l'apparition de la page perd silencieusement
  l'attribution de revenu** — le retrait passe, le montant disparaît. Sur un
  téléphone lent, au comptoir, c'est le geste normal.

  **NON PROUVÉ.** Il faut mesurer, pas conclure : rejouer le spec N fois en
  journalisant la `FormData` réellement postée, et vérifier si le défaut
  survit à une attente d'hydratation explicite. Le harnais
  `flaky-measure.yml` accepte déjà `spec` et `projet` en paramètres — la
  mesure est à portée de main, elle n'a pas été faite.

  À noter au passage : `player-win.spec.ts:55-69` porte **déjà** un
  contournement de la même famille que le défaut traité ce jour — un `try /
  catch` avec `page.reload()` parce que « le rafraîchissement RSC qui suit
  l'action peut traîner ». Le test avait rencontré le défaut avant nous et
  l'avait absorbé.

- **🔴 Deux styles de roue rendaient le titre de `/play` ILLISIBLE, en
  production, depuis toujours (2026-07-30)** — trouvé en poursuivant un rouge
  de CI qui, lui, s'est révélé être un artefact de mesure. Le rouge ne valait
  rien ; ce qu'il a fait ouvrir vaut beaucoup.

  | Preset | Dégradé | Titre | Ratio | Seuil |
  |---|---|---|---|---|
  | **Pastel** | `#fbcfe8` → `#fda4af` | `text-white` | **1,38:1** | 3:1 |
  | **Cartoon** | `#fef08a` → `#f59e0b` | `text-white` | **1,16:1** | 3:1 |

  Permanent. Aucune animation, aucun artefact : **tout commerçant qui choisit
  l'un de ces deux styles publie une page dont l'accroche est pratiquement
  invisible.** Personne ne l'avait vu parce que les seules roues semées en E2E
  utilisent des styles sombres — le capteur ne pouvait structurellement pas
  l'atteindre.

  **La cause est une question mal posée, recopiée dix-huit fois.** Le produit
  écrivait `style.pageTheme === "kermesse"` et s'en servait pour choisir la
  couleur du texte. Or ce qui décide de la lisibilité n'est pas le thème
  *déclaré* mais la clarté du fond *réellement peint*. Ces deux presets
  embarquent un dégradé clair en gardant `pageTheme: "nuit"`.

  **Correctif structurel, et non deux presets recolorés** : `bgFrom` et `bgTo`
  sont des champs de couleur **libres**. Un commerçant peut déjà poser un fond
  blanc et obtenir un titre blanc ; recolorer deux presets aurait réparé deux
  exemples en laissant le défaut entier. `playOnLightSurface()` remplace les
  dix-huit comparaisons — « la surface est claire si le blanc échoue en
  AA-large », c'est-à-dire exactement la chose qu'on cherche à éviter, et non
  un seuil de luminance arbitraire.

  **Deuxième défaut, trouvé par la garde et non par l'œil** : `text-zinc-400`
  tombe à **3,82:1** sur « Festif » et **3,98:1** sur « Minimal ». La raison est
  instructive — le jeton avait été validé « à 8,9:1 sur `#0c0118` », une
  couleur **jamais peinte** : le fond par défaut de `PlayShell`, paramètre mort
  puisque la page passe toujours `surface.background`. Le jeton était calibré
  contre une valeur imaginaire. `zinc-300` (`#d4d4d8`) rend 6,78 et 7,07 en
  restant en net retrait du blanc (14,2:1 contre 21:1). *Valeur convertie
  depuis l'oklch de Tailwind 4 et vérifiée : le convertisseur retrouve
  `#9f9fa9` pour `zinc-400`, là où trois lectures avaient repris de mémoire le
  `#a1a1aa` de Tailwind 3.*

  **Troisième défaut, jamais scanné** : `claim-form.tsx` posait un `play-in`
  **dans** celui de la phase « won ». Les opacités d'ancêtres se multiplient —
  0,75 × 0,75 = **0,5625 pendant 450 ms**, sur l'écran où le joueur saisit son
  prénom, son e-mail et coche les conditions. Le plancher de 0,75 avait été
  calculé pour **une** couche. Aucun scan a11y ne pouvait le voir : le seul du
  parcours joueur se fait *avant* le spin.

  **Garde** : `src/lib/play-contrast.test.ts` refait le calcul WCAG à chaque
  exécution, pour chaque preset, avec la palette que `playOnLightSurface`
  choisira vraiment — donc il tient pour le preset ajouté demain. **Deux
  contrôles négatifs joués** : remettre l'ancienne règle fait tomber 4 tests en
  nommant 1,38 et 1,16 ; remettre `zinc-400` en fait tomber 2 en nommant 3,98
  et 3,82.

  **Ce qui restait ouvert ici est CLOS depuis (2026-07-30/31, relu et confirmé
  2026-08-01, branche `chantier/solder-les-ouverts`)** : (1) l'**artefact
  d'axe** — fermé par `PlayBackdrop` qui peint le `body` (voir l'entrée
  « ✅ L'artefact d'axe sur `/play` », ligne 1566 ci-dessus) ; (2) les
  **couleurs libres** — fermé par `playContrastWarning` (voir « ✅ Les
  couleurs LIBRES sont désormais averties », ligne 1609) ; l'exemple choisi à
  l'époque, l'ambre `#f59e0b`, était en fait **faux** — recalculé, il rend
  5,42:1 sur le jeton de corps sombre que la bascule choisit réellement, donc
  au-dessus du seuil ; la vraie demi-teinte irrécupérable est `#7a7a7a`. (3)
  le **kicker** `text-white/60` — fermé, le jeton n'existe plus (voir « ✅ Le
  plancher d'opacité… », ligne 1591) : passé en jeton plein, il rend 6,68:1 au
  pire, gardé par `src/lib/play-contrast.test.ts`.

  **Changement d'apparence assumé** : sur la page crème, les mentions
  discrètes passent de `k-muted` à `k-body` (contraste 5,4 → ~9:1) ; sur les
  pages sombres, le texte secondaire s'éclaircit de `zinc-400` à `zinc-300`.
  Les deux vont dans le sens de la lisibilité.

- **🔴 `router.refresh()` — le défaut n'était pas confiné à la progression :
  69 gestes audités, 5 nocifs confirmés (2026-07-30)** — après le correctif de
  l'éditeur de saison, la question suivante s'imposait : *ce hook était-il le
  seul ?* Non. `router.refresh()` vit dans 23 fichiers, plus
  `use-action-form.ts:68` — un point d'appel unique qui en dessert ~98 sur une
  quarantaine de fichiers.

  **Audit à 8 lots + réfutation adversariale des cas nocifs. 12 candidats,
  5 confirmés, 7 réfutés.**

  | Catégorie | Total | Nocifs |
  |---|---|---|
  | périodique (jauges, comptoir, calendrier) | 5 | **0** — un tic manqué est rattrapé au suivant |
  | l'action redirige | 6 | **0** — la navigation porte le résultat |
  | état local optimiste | 7 | **0** |
  | résultat visible autrement | 19 | **0** |
  | **seul moyen d'affichage** | 32 | **12 candidats → 5 confirmés** |

  **La catégorie est le prédicteur, sans exception.** Un `router.refresh()`
  n'est pas nocif en soi ; il l'est quand il est le seul moyen pour l'écran de
  montrer ce que l'utilisateur vient de faire, et que refaire le geste crée un
  doublon.

  **Les cinq confirmés**, tous côté commerçant, tous corrigés par rechargement
  franc :
  1. `prize-editor.tsx` — segment de roue dupliqué. `revalidatePlaySlugs` purge
     l'ISR de `/play` aussitôt : **le doublon part aux joueurs pendant qu'il
     reste caché au seul homme qui pourrait le supprimer.** Poids et
     probabilité de tirage doublés.
  2. `hunt-editor.tsx` — étape fantôme. La RPC de scan compte les étapes en
     base : une étape dont le QR n'a jamais été imprimé **rend une chasse en
     cours impossible à terminer**.
  3. `quiz-editor.tsx` — question en double, posée deux fois aux joueurs d'un
     quiz asynchrone que personne ne surveille.
  4. `event-editor.tsx` (question) — doublon lançable deux fois depuis la
     télécommande, en soirée devant le public.
  5. `event-editor.tsx` (session) — sessions `draft` fantômes, chacune avec son
     code d'accès et son stock.

  **`reloadOnSuccess` est une OPTION, pas le défaut de `use-action-form`.**
  Basculer le défaut changerait ~98 sites dont l'audit n'a ouvert qu'une
  fraction. Le revers est assumé et écrit dans le hook : c'est une case à
  cocher, donc une case qu'on oublie ; le jour où la population entière aura
  été ouverte, c'est le défaut qu'il faudra inverser.

  **Ce que le LOT TÉMOIN a appris** — les deux fichiers déjà corrigés servaient
  de contrôle. Ils sont ressortis propres, ce qui valide la grille. Mais
  **12 entrées de l'inventaire les concernant décrivaient un `router.refresh()`
  qui n'existe plus** : un classificateur avait jugé des points d'appel *sans
  ouvrir le hook qu'ils appellent*. Même racine que la règle déjà en mémoire —
  lire le catalogue vivant, pas l'archive. Variante à retenir : `run(() => …)`
  ne dit rien du mécanisme d'affichage, c'est le hook qui le porte.

  **Les trois familles ci-dessous sont CLOSES ou réfutées (2026-08-01,
  branche `chantier/solder-les-ouverts`, commit `ff8a722`)** — 27 affirmations
  de cette zone relues contre le code vivant : 9 confirmées, 15 déjà closes
  par des chantiers antérieurs sans que ce document l'enregistre, 3 fausses.

  **Bascules d'état de surfaces publiques — 7 confirmées, corrigées
  (`ff8a722`)** : `contest-settings.tsx` (statut du championnat, ouvrir/fermer
  — ÉLEVÉ ; récompense remise) ; `contest-matches.tsx` (résultat de match) ;
  `contest-questions.tsx` (résultat de question) ; `merchant-controls.tsx`
  (12 bascules back-office : module calendrier, suspension d'un commerçant,
  9 autres addons/sanctions via `const BASCULE`) ; `event-remote.tsx` (un
  joueur modéré en direct — la liste `players` est une prop serveur pure,
  jamais couverte par le poll). Chacune posait `useActionForm(...)` sans
  `reloadOnSuccess`, avec un écran qui n'affichait le succès qu'en
  n'affichant RIEN (ou en gardant l'ancien état). Garde mécanique ajoutée :
  `src/lib/use-action-form-bascule.test.ts` (14 bascules couvertes, 5
  contrôles négatifs, sabotage vérifié appliqué).

  **9 autres bascules du même inventaire, réexaminées, étaient DÉJÀ closes**
  par des chantiers antérieurs (`reloadOnSuccess: true` déjà en place) sans
  qu'aucune entrée de ce fichier ne le dise : `campaign-settings.tsx`
  (publier/dépublier la roue), `calendar-editor.tsx`, `hunt-editor.tsx`
  (activer/archiver), `quiz-editor.tsx` (activer/archiver — distinct du
  réordonnancement ci-dessous), `jackpot-editor.tsx`, `loyalty-editor.tsx`,
  `event-editor.tsx` (jeu), `progression-season-card.tsx` (clore une saison,
  déjà documenté ligne 1895 ci-dessus), `contest-settings.tsx` (clôture de
  championnat).

  **Réordonnancements (`quiz-editor.tsx`, `hunt-editor.tsx`) — DÉJÀ clos**,
  eux aussi sans que cette entrée le reflète : voir « ✅ Le réordonnancement
  écrivait un ordre que PERSONNE n'avait demandé » ci-dessus (ligne 1523),
  `src/lib/ordre-optimiste.ts`. Résidu mineur non nocif qui subsiste : le
  badge de rang et les libellés d'accessibilité affichent encore la position
  **serveur** pendant un écrasement local non rafraîchi (numéros visuellement
  faux, ordre réel correct).

  **`contest-leagues.tsx:301` (doublon de ligue) — FAUSSE.** Le résultat de
  l'action (dont le code de la ligue) est porté par `state`, pas par le
  rafraîchissement — bandeau `role="status"` non minuté à `contest-leagues.tsx:341-345`,
  champ vidé (`setName("")`) qui rend le bouton `disabled` tant qu'un nom
  n'est pas retapé. Un second clic accidentel est donc impossible ; la RPC
  `create_contest_league` ne bloque de toute façon pas les doublons de nom
  (seul le code est unique) et le rate-limit borne à 5 créations/heure/joueur.
  Erreur de classification d'origine : le site avait été rangé « seul moyen
  d'affichage » sans ouvrir le corps de la fonction.

  **Reste ouvert, sans changement** : les **32 « génants »** de l'audit
  d'origine n'ont toujours eu qu'une seule passe sans réfutation (ce
  chantier n'a rouvert que les 3 familles ci-dessus, pas l'inventaire
  complet) ; **aucun taux n'a été mesuré hors progression** — tout le reste
  transpose les 5–32 % d'un seul module, et `contest-experience.tsx:159`
  (l'action y pose un cookie, revalidation par un chemin distinct) prouve que
  cette transposition peut être fausse en principe.

- **✅ `revalidatePath` mort — 197 chemins, un seul faux, et il l'était depuis
  toujours (2026-07-30)** — trouvé par accident pendant l'audit ci-dessus, puis
  vérifié systématiquement. `updateEventSession` revalidait
  `/dashboard/events/sessions/${id}` : **aucune route ne correspond** (les
  seules sont `/dashboard/events`, `/dashboard/events/[id]` et
  `/dashboard/events/[id]/remote`). Deux erreurs dans une ligne — le segment
  `sessions/` n'existe pas, et l'identifiant était celui de la session au lieu
  de celui de la partie.

  Le commerçant modifiait le lot d'une session, l'action répondait « ok », et
  l'écran gardait l'ancienne valeur. **Next ne dit rien** : revalider un chemin
  inexistant est un no-op silencieux.

  Corrigé, et surtout **gardé** : `src/lib/revalidate-coverage.test.ts` croise
  l'arbre des routes avec les ~200 chaînes écrites à la main. Contrôle négatif
  joué — réintroduire le chemin mort fait tomber la garde en nommant le
  fichier et la ligne. Deux contrôles négatifs du test lui-même en prime (deux
  listes vides donneraient zéro mort, donc un vert qui ne vérifie rien — le
  défaut exact qui avait rendu le filet de nonce inutile pendant deux semaines).

  Ce que la garde **ne** prouve pas : que le chemin soit le *bon*. Un
  `revalidatePath('/dashboard')` posé là où il fallait `/dashboard/campaigns/[id]`
  passerait. C'est une garde contre le chemin mort, pas contre le chemin inexact.

- **✅ `progression.spec.ts` — 60 essais, et le défaut a CHANGÉ DE PLACE sans
  changer de nature (2026-07-30, run `30542817274`)** — la mesure la plus
  longue jouée sur ce spec, et la seule qui tranche.

  | | avant (`033bc78`) | après (`3002f1c`) |
  |---|---|---|
  | comptés | 20 | 54 (6 essais écartés par les gardes) |
  | rouges | 1 (**5 %**) | 3 (**5,6 %**) |
  | assertion en échec | `seasonHeading` — la saison créée | **le BADGE ajouté** |

  Lu vite, le taux ne bouge pas et le correctif a échoué. Lu correctement,
  c'est l'inverse : **l'assertion qui tombait ne tombe plus une seule fois sur
  54**, et ce qui reste est un SECOND exemplaire du même défaut, un cran plus
  loin — masqué jusque-là parce que le test s'arrêtait avant de l'atteindre.
  Le taux global était la somme de deux occurrences, pas la mesure d'une seule.

  **La cause commune** : `useProgressionMutation`
  (`progression-season-card.tsx`) appelait `router.refresh()`. Toutes les
  mutations de l'éditeur de saison passent par ce hook — badges, collections,
  objets, missions, coffres, et les transitions de saison. L'action répond 200,
  la ligne est en base, le `GET ?_rsc=` répond 200, et l'écran ne l'applique
  pas. Même famille que la transition figée (vercel/next.js #82289, #88767).

  **Pour le commerçant** : le badge qu'il vient d'ajouter n'apparaît pas, il le
  rajoute, sa saison porte deux badges identiques.

  **Correctif** : rechargement franc dans le hook, comme sur la création de
  saison — le seul mécanisme dont on ait la preuve qu'il s'applique toujours.
  Il coûte ~1 s sur un écran de configuration où les gestes se comptent en
  dizaines ; c'est le bon marché face à des actes dont une partie sont
  définitifs. L'écrasement local du statut (`applied`) reste, il couvre
  l'intervalle entre le clic et le rechargement.

  **La leçon de méthode** : un correctif validé par un taux global qui ne bouge
  pas aurait été jeté. C'est l'**assertion nommée dans le journal** qui a permis
  de voir que le défaut avait déménagé. Mesurer un taux ne suffit pas — il faut
  mesurer **où**.

- **🔴 `e2e/progression.spec.ts` — MESURÉ pour la première fois, et la cause
  écrite ci-dessous est FAUSSE (2026-07-30)** — trois jours durant, ce fichier
  a expliqué l'instabilité par « la LONGUEUR de la chaîne — treize étapes en
  série ». Cette explication n'a **jamais** reposé sur une mesure, et les faits
  la contredisent.

  **Ce qui a été mesuré** : un job CI dédié
  (`.github/workflows/flaky-measure.yml`, déclenchable à la demande) rejoue le
  spec N fois en réarmant l'état entre chaque essai. Vingt essais, calibrés :
  à ~15 % d'échec, six passages verts ont plus d'une chance sur trois d'être
  fortuits ; vingt ramènent ce risque à ~4 %.

  **Résultat du premier passage exploitable : 6 rouges sur 20 — et les SIX
  portent la même erreur**, `expect(page).toHaveURL(/dashboard/)` avec la page
  restée sur `/login` (`e2e/helpers.ts:20`). **L'échec est à la CONNEXION, pas
  dans le parcours de progression.** Aucun des six n'échoue sur une étape du
  cycle de vie ; le parcours ne commence même pas.

  **La mesure elle-même n'est pas encore concluante**, et il faut le dire :
  le harnais réinitialise la base entre les essais, ce qui recrée la base sous
  les pieds de GoTrue et invalide ses connexions. Une part de ces six rouges
  peut être de la convalescence d'infrastructure, pas un défaut produit. Un
  préchauffage de l'authentification a été ajouté (jeton demandé directement à
  GoTrue avant de compter l'essai) et la mesure relancée.

  **CE QUE CE HARNAIS A DÉJÀ ENSEIGNÉ, et qui vaut au-delà de ce test** : un
  harnais cassé ment dans les DEUX sens.

  | Version du harnais | Résultat | Réalité |
  |---|---|---|
  | réarmement par re-seed | 19 rouges sur 20 | le seed réinsère la saison en `on conflict (id) do nothing` : il ne ROUVRE pas une saison close. Dès l'essai 2, le test échouait légitimement |
  | réarmement par reset complet | 6 rouges sur 20 | tous à la connexion — infrastructure suspecte |

  La règle écrite jusqu'ici (« calibrer le nombre d'essais ») ne prévoyait que
  le faux VERT. Le faux ROUGE est plus dangereux : on est prêt à le croire
  quand on cherche un défaut. D'où deux gardes qui écartent l'essai plutôt que
  de le compter : la saison semée doit être **active** (et pas seulement
  exister), et l'authentification doit **répondre**.

  **Ne pas reprendre l'hypothèse « longueur de la chaîne » sans la mesurer.**
  Le bloc `describe.serial` qu'elle invoque n'existe d'ailleurs plus : le spec
  a été réécrit en tests indépendants sur saison semée.

- **~~`e2e/progression.spec.ts` — instabilité ATTÉNUÉE mais NON ÉTEINTE~~ —
  RÉSOLU par l'entrée ci-dessus, conservé pour la trace**
  (mesure du 2026-07-28)** — la réécriture avec fixture semé (saison de
  progression semée en base par `supabase/seed.sql`, spec raccourcie de
  209 lignes) a nettement réduit la fragilité : le bloc passe désormais sur
  `main`, sur la PR #32 et sur la PR #14. **Mais `progression.spec.ts:220`
  (« l'éditeur clôt la saison semée ») est retombé sur la PR #31, puis passé
  à la relance sur un code strictement identique.** Le point douloureux s'est
  déplacé et réduit — d'un bloc de treize étapes à cette seule assertion de
  clôture (`card.getByText("Terminée")` après le dialogue de confirmation) —
  il n'a pas disparu. **Conséquence pratique : ce test peut bloquer une PR qui
  n'a aucun rapport avec lui** — #31 ne modifiait que `site/`, répertoire que
  la suite E2E n'ouvre jamais. Toute affirmation antérieure de « dette
  résolue » (dont une dans `CLAUDE.md`, corrigée depuis) était prématurée.

  **↳ Mesure du 2026-07-29, et RECTIFICATION d'une seconde affirmation trop
  forte.** Après la migration des transitions figées, ce test est passé **6
  fois sur 6** en local et j'en ai conclu qu'il était « éteint » (message du
  commit `2e83238`). **C'était une faute de raisonnement, pas seulement de
  formulation** : à un taux d'échec d'environ 15 %, six passages consécutifs
  ont plus d'une chance sur trois de tous réussir. Six succès ne distinguent
  pas « corrigé » de « pas de chance ». Confirmation par la CI de la PR #36,
  branche qui ne touche NI la progression NI la caisse : `:220` est tombé au
  premier passage et **de nouveau à la relance**, sur code identique. La dette
  reste donc **atténuée, pas éteinte** — formulation d'origine, qui était la
  bonne.

  **Règle à en tirer** : pour déclarer éteint un défaut intermittent, il faut
  un nombre d'essais calibré sur son taux mesuré (≈20 passages pour ~15 %,
  comme pour le harnais newsletter et celui des jeux de révélation), pas un
  échantillon de commodité.

  Historique de la décision qui a mené là :
- **`e2e/progression.spec.ts` — bloc « cycle de vie complet » instable, dette
  ASSUMÉE par décision client (2026-07-27, `ba0cdbf`)** — décision explicite
  de garder ce test **ACTIF et rouge** plutôt que de le neutraliser (motif du
  client : un test rouge qui dit quelque chose de vrai vaut mieux qu'un test
  vert qui ne teste plus rien). **Conséquence directe : la PR #29 reste
  ROUGE sur ce seul point**, tous les autres jobs verts (22/22 suites pgTAP,
  1 804 assertions, 1 304 tests unitaires, snapshot de types à jour) — les
  affirmations antérieures de « PR entièrement verte (6/6 jobs) » /
  « E2E verts » dans ce fichier, `docs/audit-3-backlog.md`, `CLAUDE.md` et
  `.claude/state/checkpoint.md` décrivaient un état du 2026-07-27 matin,
  dépassé le même jour. Mesuré sur six passages CI consécutifs : l'échec **se
  déplace** d'un passage à l'autre — titre de saison, collection, objet,
  mission, réactivation de mission, bouton d'ouverture de coffre — avec un
  code identique sur la portion qui tombe. **Ce n'est pas un défaut
  applicatif** : le module est prouvé par 1 804 assertions pgTAP dont un
  contrôle négatif (migration retirée → 8 assertions tombent), et ce
  parcours est passé intégralement plusieurs fois, en CI comme en local.
  Cause : la LONGUEUR de la chaîne — treize étapes en série sur un seul
  projet (huit créations pilotées à l'écran, un lancement, une désactivation,
  une réactivation, un parcours joueur, une clôture), chacune une action
  serveur suivie d'une revalidation ; un accroc n'importe où fait tomber les
  trois tests, `describe.serial` empêchant les suivants de tourner.
  `retries: 0` est **délibéré et doit le rester** : l'état est partagé entre
  les trois étapes, une reprise rejouerait la chaîne contre une base portant
  déjà une saison (état que la CI ne connaît pas) — l'instabilité reste ainsi
  visible plutôt que noyée dans une reprise silencieuse. **Correction juste,
  dans un chantier dédié, pas une retouche** : semer la configuration de
  saison directement en base et ne faire porter à l'E2E que les
  comportements d'écran. **Deux acquis à ne pas perdre** : ce test a PROUVÉ
  le correctif d'identité (`20260805230000`, ADR-045) — jauge à 1/1 et clé
  créditée au premier tour de roue d'un joueur neuf, preuve que pgTAP seul ne
  peut pas donner ; et un défaut de conception du test a été corrigé au
  passage (`e52c3df`) — la mission octroyait l'objet que le coffre devait
  débloquer, or `availableItems` compte les objets NON encore possédés, donc
  le coffre se vidait d'avance et son bouton restait désactivé (le produit
  avait raison, le test se sabotait ; la mission n'octroie plus que le badge
  et la clé).
- **Trois tests E2E flaky, passent à la reprise (dette de fiabilité, pas
  défaut produit)** — observés sur les derniers passages CI de la PR #29 :
  `e2e/player-win.spec.ts:22` (contraste axe sur `/play/E2EWIN01`, 3 nœuds —
  `.font-semibold`, `h1`, `.mt-4` — que l'ADR-046 n'a pas entièrement
  couverts), `e2e/player-win.spec.ts:131` (dépassement de délai sur
  « Retourner la carte »), `e2e/pronostics.spec.ts:93` (fragilité déjà
  connue, antérieure au chantier audit 3).
- **Seaux `failClosed` sur clé partagée dans des parcours publics (dette
  PRÉEXISTANTE hors module)** — formalisé 2026-07-22 par ADR-032 pendant le
  chantier passeport. `hunt:scan:ip`, `hunt:claim:ip`, la famille `prono:*` et
  `spin:ip` posent un rate limit `failClosed` sur une clé PARTAGÉE (IP) : un
  tiers derrière le même Wi-Fi de commerce ou le même CGNAT peut couper le
  service pour tous (déni de service à coût dérisoire). **Disponibilité seule —
  aucun impact argent ni multi-tenant.** Le module passeport a été livré sans
  aucun seau de ce type, et la règle a été appliquée rétroactivement au claim
  de gain. La purge de cette dette (hunt / prono / spin) est **en cours dans un
  chantier séparé** (traité par un autre agent) — non marquée résolue ici.
  Voir ADR-032.

### Mode événement en direct — revue sécurité pré-prod (2026-07-23)

Verdict : **déployable, 0 finding bloquant**. L'invariant central (la bonne
réponse ne fuit jamais avant `reveal`) tient sur 4 défenses redondantes,
vérifiées sur les payloads réels. Voir ADR-034.

- **Pseudo sans filtre de charset → brouillage de l'écran public (FAIBLE)** —
  trouvé/résolu 2026-07-23 (`e39a40c`). Le pseudo (affiché en grand sur la TV et
  au classement) n'était borné qu'en longueur : des caractères de contrôle /
  formatage Unicode (bidi override U+202E, zéro-largeur) pouvaient brouiller
  l'affichage ou usurper visuellement le pseudo d'un autre. **Aucun XSS** (React
  échappe, pas de `dangerouslySetInnerHTML`). `pseudoSchema` refuse désormais
  `\p{Cc}\p{Cf}` (test de non-régression ajouté).

### Calendrier de l'Avent & campagnes quotidiennes — revue finale (2026-07-23)

Verdict : **prêt pour la production, 0 finding bloquant** (workflow 3 lentilles).
Les deux invariants neufs — gating temporel serveur-autoritatif et non-fuite du
contenu d'une case non ouverte (quadruple défense) — tiennent, vérifiés par revue
adversariale sur les payloads réels. Voir ADR-035.

- **Spoiler des roues de cases `spin` verrouillées dans le payload RSC (FAIBLE,
  spoiler)** — trouvé/résolu 2026-07-23 (`5c4d89f`). Le préchargement révélait,
  dans le payload RSC, les segments (lots) et la config de collecte de TOUTES les
  roues cibles des cases `spin`, y compris de jours VERROUILLÉS (un visiteur
  pouvait lire le lot rare d'une case future). **L'invariant strict de non-fuite
  n'était PAS cassé** (aucune association jour→roue, aucun code de retrait
  exposé), mais le spoiler était réel. Fix : préchargement limité aux roues des
  cases DÉJÀ ouvertes par le joueur ; `openCalendarBox` renvoie le bundle de la
  case qu'il vient d'ouvrir (module `src/lib/calendar-spin-bundle.ts`,
  `loadCalendarSpinBundles` ; `organizationId` ajouté au contexte d'action ;
  côté client `allBundles` = préchargé + à-la-volée). typecheck ✓, eslint ✓,
  775 tests ✓.

### Parrainage ludique — revue sécurité (2026-07-24)

Verdict : **prêt pour la production, GO, 0 finding bloquant**. L'anti-abus est
100 % serveur et borné par l'ÉCONOMIE (stock fini obligatoire, ADR-031) plus que
par les rate limits (ADR-032) : fabriquer un filleul coûte un spin RÉEL d'un device
distinct (`validate_referral` exige un `proof_spin_id` non forgeable/non rejouable/
unique), et la perte maximale reste plafonnée par le stock fini. Deux durcissements
appliqués en fin de chantier (`6d7bfba`) : NO-ORACLE (`validateReferral` collapse
tous les états de refus en un `rejected` unique côté action) et défense en
profondeur (`referral_public_state` re-vérifie addon + `enabled` + campagne active
en interne). Résidus assumés → Low Priority ci-dessous. Voir ADR-036.

### Jeux rapides (skill-gated) — revue sécurité vague 2 (2026-07-24)

Verdict : **NO-GO initial → 2 bloquants corrigés et vérifiés → GO**, QA verte
(`8a3c60e`). Invariant central : le tirage est le PLAFOND — un tricheur ne dépasse
jamais les odds / stock configurés (ADR-031). Voir ADR-037. La vague 1 (7 jeux de
révélation, serveur-autoritatif) était passée sans bloquant et est déployée.

- **Contournement du défi par appel direct à `spinWheel` (ÉLEVÉ)** — trouvé/résolu
  2026-07-24 (`8a3c60e`). `spinWheel` ne gardait pas le `game_type` : un appel direct
  à `spinWheel` sur une roue skill-gated déclenchait un tirage sans avoir à réussir le
  défi. Garde `isSkillGameType` ajoutée dans `spinWheelInner`, AVANT tout tirage — un
  `game_type` skill ne peut désormais être joué que par le chemin
  `submitSkillChallenge`.
- **Brute-force d'un secret sous `play_limit = unlimited` (MOYEN)** — trouvé/résolu
  2026-07-24 (`8a3c60e`). Jeton rejouable + oracle `succeeded` renvoyé au client
  permettaient de brute-forcer un secret (mystery_word / estimate / puzzle). Fermé en
  deux portes : (a) `unlimited` INTERDIT pour les jeux à secret (verrou produit +
  sécurité) ; (b) `succeeded` retiré de la réponse cliente.

### Pronostics génériques — revue sécurité (2026-07-24, NON DÉPLOYÉ)

Verdict : **NO-GO conditionnel → 2 findings de non-régression corrigés → GO**
(`f3c5752`), QA verte. Le volet générique était GO franc (verrouillage
serveur-autoritatif sérialisé sous `for update`, non-fuite du résultat démontrée
sur un point de passage unique `publicCorrectAnswer`, validation de forme en base,
multi-tenant, ADR-032). Le blocage portait entièrement sur la NON-RÉGRESSION
football. Voir ADR-038. **Au 2026-07-24 le chantier était construit et validé mais
NON POUSSÉ ; au 2026-07-25 ses 8 commits sont présents sur `origin/main`** —
l'application effective de la migration `20260801120000` en production n'a pas été
revérifiée. Le seul chantier NON POUSSÉ est désormais la place de marché de
campagnes (ci-dessous).

- **Backfill `locks_at = kickoff_at` figeant la fenêtre des matchs (ÉLEVÉ)** —
  trouvé/résolu 2026-07-24 (`f3c5752`). La migration recopiait `kickoff_at` dans
  le nouveau `locks_at` de chaque match, alors que la synchro (`contest-sync.ts`)
  ne met à jour QUE `kickoff_at`. Au premier match REPORTÉ — routine, déclenchée
  par le cron — les pronostics se seraient fermés silencieusement sur un match non
  joué, avec un message trompeur ; un match AVANCÉ aurait laissé la base accepter
  un pronostic pendant la rencontre. **Fix** : backfill supprimé, `locks_at` reste
  NULL sur les matchs, le repli tombe sur `kickoff_at` — qui suit les reports par
  construction. Tests pgTAP « match reporté » / « match avancé ».
- **`default_locks_at` fermant d'un coup un championnat football (MOYEN)** —
  trouvé/résolu 2026-07-24 (`f3c5752`). La date de verrouillage par défaut de
  l'événement primait sur `kickoff_at` pour TOUS les types : un commerçant
  football qui la renseignait fermait instantanément tout un championnat importé.
  **Fix** : la date par défaut ne s'applique JAMAIS à une question `score`
  (`score → coalesce(locks_at, kickoff_at)` ;
  `générique → coalesce(locks_at, default_locks_at, kickoff_at)`), règle posée
  dans les 4 fonctions SQL concernées ET dans le miroir TS `effectiveLocksAt` ;
  côté UI le champ est masqué pour le modèle football. Test pgTAP « date par
  défaut ignorée » + 5 tests TS.

### Place de marché de campagnes — revue sécurité (2026-07-25, NON DÉPLOYÉ)

Verdict : **GO, 0 finding bloquant — 1 MOYEN corrigé** (`4457b20`), QA verte. Les
trois invariants d'innocuité (brouillon inerte, aucun envoi, multi-tenant par la
session) tiennent et sont vérifiés sur l'ACTION, seul endroit qui écrit. Voir
ADR-039. Chantier construit et validé, **poussé sur `origin/main` le 2026-07-25**
(5 commits `ed50271` → `4457b20`) ; l'application effective de la migration
`20260802120000` en production n'a pas été revérifiée.

- **Secrets des jeux de défi lisibles par un CAISSIER via le blueprint d'un
  modèle privé (MOYEN)** — trouvé/résolu 2026-07-25 (`4457b20`). Le blueprint
  recopie `wheels.skill_config`, donc les secrets des jeux skill-gated (mot
  mystère, nombre cible et tolérance, ordre du puzzle — ADR-037). La policy de
  lecture accordait le SELECT à `is_org_member`, alors que la SOURCE de ces
  secrets (`wheels`, `campaigns`, `prizes`) est réservée aux ÉDITEURS : le secret
  passait d'« éditeurs seulement » à « toute l'équipe, caissiers compris ». Un
  caissier pouvait lire le blueprint via l'API REST avec son propre jeton de
  session et réussir systématiquement le défi (gain resté borné par ADR-031) ;
  effet de bord : poids, stocks, `cost_cents` (la marge) et budget devenaient
  lisibles par un caissier. **Fix** : policy unique `campaign_templates: editors`
  (`for all`, `is_org_editor`), miroir exact de `campaigns: editors` — aucune
  perte produit (les 3 actions exigeaient déjà owner|editor, la liste des
  campagnes est déjà vide pour un caissier). pgTAP : assertion caissier INVERSÉE
  (0 modèle lu, même ciblé par id), assertion dédiée à la non-fuite du secret,
  contre-épreuve côté éditeur ; `campaign_templates` rejoint l'audit RLS central
  `security_acl.test.sql`. INFO du même correctif : `budget_cents` en `min(1)`
  (le CHECK SQL `campaigns.budget_cents > 0` rejetait un 0 accepté par Zod).

### Créateur de quiz — revue sécurité (2026-07-25, NON POUSSÉ / NON DÉPLOYÉ)

Verdict : **GO CONDITIONNEL → tout corrigé** (`fe1e57b`) — 1 ÉLEVÉ bloquant,
1 ÉLEVÉ, 3 MOYEN, QA verte (1116 tests ✓). Les six invariants du module
(non-fuite de la bonne réponse en 3 couches, chronomètre serveur inforgeable,
réponse unique et immuable, tirage idempotent, stock fini obligatoire,
multi-tenant / ADR-032) ont été confirmés SAINS. Voir ADR-040. **Chantier
construit et validé mais NON POUSSÉ / NON DÉPLOYÉ** (6 commits locaux `cb92b19` →
`fe1e57b`, migration `20260803120000` non appliquée en production) — seul chantier
du projet dans cet état.

- **Lot émis SANS aucune réponse en mode `instant` (ÉLEVÉ, BLOQUANT)** —
  trouvé/résolu 2026-07-25 (`fe1e57b`). `finish_quiz` calculait `v_answered` mais
  ne l'utilisait pas comme garde : deux appels — rejoindre, terminer — suffisaient
  à obtenir un code `QUIZ-…`. L'identité étant un cookie gratuit (donc un seau
  `failClosed` neuf à chaque tour) et le seau IP fail-open par conception
  (ADR-032), une simple boucle vidait tout le stock promotionnel depuis une seule
  IP. **Fix** : émission conditionnée à la complétion RÉELLE
  (`v_answered >= v_total and v_total > 0`).
- **Sybil sur le corrigé complet (ÉLEVÉ)** — trouvé/résolu 2026-07-25
  (`fe1e57b`). Le corrigé est rendu au joueur dès sa réponse — il lui est dû —
  mais une passe jetable collecte ainsi le corrigé COMPLET, après quoi chaque
  identité neuve franchit le seuil à coup sûr ; de même un bot rafle les premiers
  rangs avec un temps ≈ latence réseau. **Fix** : Turnstile sur le **SEUL appel
  émetteur** (`finishQuiz`) et seulement **si un lot est en jeu** ; rien sur
  join / start / submit — aucune friction sur le chemin de jeu, aucun contrôle
  avant l'identité (ADR-032). Le jeton étant à usage unique, il est redemandé à
  chaque tentative. Résidu de fond assumé (Low Priority) : sans clés Turnstile
  provisionnées, aucun challenge n'est présenté.
- **Email persisté SANS consentement (MOYEN, RGPD)** — trouvé/résolu 2026-07-25
  (`fe1e57b`). Le couplage email ↔ opt-in n'existait que dans le composant
  client : un appel direct enregistrait l'email sans consentement. **Fix** : refus
  explicite au schéma Zod + email jamais transmis à la base sans opt-in (défense
  en profondeur, là où l'écriture se produit).
- **Purge laissant les réponses LIBRES (MOYEN, RGPD)** — trouvé/résolu
  2026-07-25 (`fe1e57b`). `purge_expired_quiz_players` neutralisait la PII de
  profil mais pas les réponses `text`, qui contiennent couramment de la PII
  (« comment s'appelle notre chef ? »). **Fix** : réponses `text` vidées pour les
  mêmes participations expirées, l'issue (`is_correct`, `points_awarded`,
  `elapsed_ms`) et le registre des codes étant conservés — le score reste
  vérifiable. Le commentaire trompeur de la fonction est corrigé.
- **Tirage à vide FIGEANT définitivement la dotation (MOYEN, piège
  irréversible)** — trouvé/résolu 2026-07-25 (`fe1e57b`). Un tirage lancé avant
  que quiconque ait terminé posait `draw_state = 'done'` à 0 gagnant, et aucune
  RPC ne revient à `pending` : la dotation du quiz était perdue pour toujours.
  **Fix** : le drapeau n'est posé qu'**après une émission réelle**, nouvel état
  `no_participants` (câblé jusqu'au TS, sinon dégradé en « Quiz introuvable »),
  rendu en information neutre — le tirage reste **relançable**.
- **INFO du même correctif** : verrou global inutile retiré de `submit`, oracle
  d'existence du classement uniformisé, gardes addon / statut ajoutées en défense
  en profondeur, motif d'URL porté dans le CHECK `image_url`, et `retryable`
  remplace une comparaison de TEXTE d'erreur côté éditeur (une reformulation
  cassait l'affichage).
- **Conséquence d'E1 traitée côté UI** : une question chronométrée abandonnée est
  désormais **SOUMISE** (hors barème) au lieu d'être sautée — la complétion étant
  devenue la condition d'émission, un joueur honnête qui laisse filer le temps
  aurait autrement perdu sa récompense.

### Encaissement en caisse des lots de pronostics — revue sécurité (2026-07-25)

Verdict : **GO conditionnel**, **aucun CRITIQUE ni ÉLEVÉ**. Le chantier corrige
lui-même une **anomalie fonctionnelle en production** : les codes `PRONO-…`
étaient émis, affichés au joueur et annoncés « à présenter en caisse », alors
que `lookupRedeemCode` ne routait que 8 sources et que le seul chemin de remise
(`set_contest_award_status`) exige `is_org_editor` — **un caissier ne pouvait pas
remettre le lot**. Voir ADR-043. Commits `e310606` → `f873b77` sur `main`.

- **Fuite inter-tenant potentielle du championnat et du PRÉNOM DU GAGNANT
  (MOYEN, M1)** — trouvé/résolu 2026-07-25 (`f873b77`). `redeem_contest_award`
  ne filtrait que sur `contest_awards.organization_id`, colonne dénormalisée
  qu'aucun CHECK ni trigger ne garantit alignée avec `contests` /
  `contest_players` (et que `service_role` peut écrire). Une désynchronisation
  (ré-affectation, fusion d'organisations, correctif manuel) aurait affiché au
  comptoir `c.name` et `pl.first_name` d'une AUTRE organisation. **Fix** :
  jointures org-scopées sur `contests` ET `contest_players`, **étendues à
  l'`UPDATE`** et pas seulement à la lecture — ne scoper que la lecture aurait
  produit un état PIRE que le défaut d'origine : le lot consommé et audité
  pendant que la caisse affiche « code inconnu ».
- **Jeton `cashier:lookup` consommé par FAMILLE de codes (MOYEN, M2 — NON
  LIVRÉ)** — identifié 2026-07-25, **toujours ouvert**. `lookupRedeemCode`
  essaie les familles en séquence et chacune consomme son propre jeton : une
  saisie **nue** de 8 caractères (sans préfixe) en consomme **9**, ce qui ramène
  le caissier à environ **3 recherches par minute**, et le refus s'affiche
  « code introuvable » sur un lot parfaitement valide. Concerne les **9 sources**,
  pas seulement les pronostics. Le correctif est **écrit et vert (1 222 tests)
  mais NON COMMITÉ** : `src/actions/participations.ts` porte 495 lignes de
  modifications mêlant ce correctif et le chantier « registre universel » en
  cours. À reprendre dès que l'arbre de travail sera au propre.
- **Assertions pgTAP jamais exécutées (dette de vérification, pas un défaut
  connu)** — 2026-07-25. Les **43 assertions** de
  `supabase/tests/contest_awards.test.sql` et les **4** ajoutées à l'audit ACL
  central n'ont pu être jouées ni localement (ni Docker ni CLI Supabase) ni
  ailleurs : elles ne seront prouvées qu'au job `database-security` de la CI.
  C'est le trou réel du chantier. Les 1 147 tests unitaires, le typecheck, le
  lint et le build ont bien été exécutés et sont verts.

### Méta-progression — revue sécurité (2026-07-26, NON POUSSÉ)

Verdict : **GO conditionnel**, **aucun CRITIQUE ni ÉLEVÉ**. Voir ADR-044.
Commits `8a4324f` → `793100a` sur `chantier/audit-3`.

- **Seau `failClosed` composé sur un `organizationId` fourni par le client
  (MOYEN, M1)** — trouvé/résolu 2026-07-26. Chaque UUID inventé par un
  attaquant ouvrait un seau de rate-limit neuf, donc un débit non borné avec
  un seul cookie ; et le compteur d'observabilité était appelé **après** le
  contrôle d'organisation, rendant la rafale invisible au monitoring. **Fix** :
  seau sur la seule clé d'identité, consommé en amont, observation hissée
  avant le contrôle.
- **Commentaire d'invariant faux sur `org_progression_snapshot` (MOYEN, M2)**
  — trouvé/résolu 2026-07-26. Le commentaire affirmait qu'un caissier lisait
  « strictement moins qu'un visiteur » ; faux sur quatre points (saisons
  brouillon, missions et coffres désactivés, agrégats). **Fix** : branche
  `seasons` passée à `is_org_editor`, commentaire réécrit. Le danger principal
  n'était pas l'écart d'accès observé mais l'invariant faux lui-même, qu'une
  revue future aurait pu citer pour justifier un assouplissement de plus.
- **Aucun interrupteur d'arrêt sur une saison lancée (MOYEN, M3)** —
  trouvé/résolu 2026-07-26. Toute correction d'une mission ou d'un coffre
  trop généreux exigeait de clore toute la saison. **Fix** :
  `set_progression_mission_enabled` / `set_progression_chest_enabled`, seul
  geste autorisé sur une saison lancée, ne touchent que `enabled`.
- **5 FAIBLE corrigés**, dont **F1** (la relecture d'idempotence du tirage de
  butin ignorait `chest_id` : un coffre pouvait rendre le butin d'un autre) et
  **F2** (`progression_engine_failures` n'avait **aucun lecteur** — un échec
  systématique du moteur serait resté silencieux en production ; corrigé par
  la sonde SLO ajoutée à `src/lib/admin/ops.ts`).

**Résidus assumés** :
- Le seau de rate-limit par appareil (`progressionDevice`) borne un **cookie,
  pas un humain** : renouveler son cookie donne un seau neuf. Cohérent avec
  les 7 modules frères ; rien de monétaire n'est en jeu (invariant non
  monétaire, ADR-044).
- `observeProgressionPressure` reste keyée sur l'`organizationId` fourni par
  le client : une rafale crée toujours une ligne `rate_limits` par UUID
  inventé, désormais plafonnée en amont par le fix M1.
- **La sonde F2 n'a aucun test dédié** (`src/lib/admin/ops.ts` n'a pas de
  fichier de test) : « journal illisible ≠ 0 échec » n'est garanti que par
  relecture, pas par exécution.
- **Le panneau joueur n'est visible que depuis la roue** (`/play/[slug]`) :
  ni les 14 jeux rapides, ni passeport/calendrier/quiz/chasse/jackpot/
  événement. Les missions **progressent** pourtant déjà depuis toutes ces
  expériences via le trigger `apply_meta_progression_event()` — c'est la
  visibilité qui est partielle, pas le mécanisme.
- Pas de garde d'addon : conséquence assumée du report de la monétisation du
  module au packaging commercial (item 10 du backlog de l'audit).
- Couverture E2E de l'interrupteur **coffre** écartée dans
  `e2e/progression.spec.ts` : miroir exact de celle de la mission, jugée
  redondante.
- Branche `mission already has player progress` conservée en garde-fou dans
  le backend, **inatteignable aujourd'hui** (une saison brouillon n'a pas
  encore de progression) ; le refus réellement rencontré en pratique est
  `draft mission not found`.
- Réordonnancement des objets de collection non exposé en UI (`position`
  accepté côté RPC, aucun contrôle pour le régler depuis l'éditeur).
- **pgTAP (799 assertions : 293 `meta_progression.test.sql` + 506
  `security_acl.test.sql`) et E2E (`e2e/progression.spec.ts`) n'ont jamais
  été exécutés.** Docker Desktop exige un build Windows ≥ 19045, cette
  machine est figée en LTSC 2021 / 19044 pour toute sa durée de vie — pas un
  manque temporaire. Deux défauts d'`e2e/progression.spec.ts` ont été trouvés
  par **relecture du markup** (un `getByRole("heading")` sur un `<p
  role="group">`, un libellé attendu sans le mot « maintenant »), aucun par
  exécution. Seul le job CI `database-security` en fera la preuve, et
  seulement une fois la branche poussée et passée en PR (la CI ne se
  déclenche que sur `push` vers `main` et sur `pull_request`).

## Low Priority

- **Tuiles checklist + autosave — hors périmètre assumé (2026-08-08,
  `chantier/tuiles-checklist-autosave`)** :
  - **État de repli non persisté** : chaque tuile repliée revient à son état
    fermé par défaut à chaque visite de page, comme les `<details>` du
    produit avant ce chantier ; aucune persistance côté client ou serveur.
  - **`useAutoSave` n'annule pas la perte sur navigation sans `blur`** : le
    minuteur de debounce (800 ms) est annulé au démontage du composant ; une
    navigation qui interrompt la page avant l'échéance et sans passage par un
    `blur` de champ peut perdre la dernière frappe non enregistrée. Borné par
    le flush systématique à la sortie de champ, non éliminé.
  - **`reloadOnSuccess` et `toastOnSuccess` incompatibles** dans
    `useActionForm` : aucun appelant actuel ne combine les deux options ; la
    combinaison n'est pas gardée mécaniquement si un futur appelant le
    faisait.
  - Impact : aucun de ces trois points n'a de conséquence observée en
    production (1 org de test) ; consignés pour éviter qu'un futur chantier
    les redécouvre comme des bugs.

- **Fonds thématiques cartoon — 3 INFO de la revue sécurité laissées en
  suivi (2026-08-07, `chantier/themes-cartoon`)** — revue dédiée : GO, 0
  critique/élevé/moyen/faible, 4 INFO (INFO-1 corrigée avant fusion, voir
  ADR-093) :
  - **INFO-2, ordre de déploiement** : la migration
    `20260917120000_themes_saisonniers.sql` doit précéder la promotion du
    build. Sinon le select public de `/pronos` reçoit une colonne inconnue
    (42703, PostgREST) et affiche « Ce championnat n'existe pas » pour tout
    le monde le temps de la fenêtre — fail-closed mais indisponible ; même
    classe côté calendrier, en 23514 à l'enregistrement d'un thème encore
    refusé par l'ancien CHECK.
  - **INFO-3, parité palette SQL↔TS non testée entre les deux côtés** :
    chaque côté (le CHECK Postgres des 6 clés, les tables de tokens
    `contest-theme.ts`/`calendar-theme.ts`) est prouvé juste séparément,
    jamais l'un contre l'autre. Un test de parité (ex. lire les valeurs du
    CHECK en pgTAP et les comparer aux clés exportées côté TS) reste à
    écrire.
  - **INFO-4, la garantie optionnel-préservant porte sur l'absence, pas le
    vide** : `theme` absent du FormData laisse la colonne intacte, mais
    `""` est refusé par l'enum comme n'importe quelle valeur hors palette.
    À savoir avant d'écrire un 4e formulaire `updateContest` qui poserait
    un champ theme avec option vide.

- **Apparence dashboard — dette et constats documentés sans action
  (2026-08-07, `chantier/apparence-dashboard`)** — issus de la revue
  sécurité fermée avant PR (GO, 0 critique/élevé) et de la campagne QA :
  - **I3 — ombrage de cookie** : le cookie de rappel fermable n'est pas
    signé ; un attaquant capable d'exécuter du JS dans la page (XSS) pourrait
    forger sa valeur pour masquer un rappel. Nécessite déjà une XSS pour
    jouer, et le gain pour l'attaquant est nul (masquer un bandeau
    d'information n'ouvre aucun accès) — documenté, non corrigé.
  - **I5 — pas de rate-limit sur `src/actions/rappels.ts`** : conforme au
    pattern des autres actions dashboard authentifiées, qui n'en portent pas
    non plus — documenté, non corrigé.
  - **Cookie de rappel posé en path `/` chez les premiers utilisateurs** :
    avant le correctif I1 (path borné à `/dashboard`, commit `1cb13a5`), le
    cookie partait sur tout le domaine. Les navigateurs qui l'ont déjà reçu
    le conservent jusqu'à expiration naturelle ou logout (qui le purge) ;
    aucune conséquence de sécurité (même contenu, juste un scope plus
    large), pas de migration de cookie prévue.
  - **Préférence de rappel par navigateur, pas par utilisateur** : assumé
    (ADR-092) — un même commerçant sur deux appareils, ou une tablette
    partagée entre deux membres d'équipe, revoit le rappel sur chaque
    nouveau navigateur ; borné par la purge au logout.
  - **`quiz-editor.tsx:836` et `wheel-style-editor.tsx:199`** restés à
    l'ancien style de titre (avant `[&>h2]:text-lg [&>h2]:font-black` sur
    `Card`) — réservés au chantier thèmes à venir (fonds cartoon par thème),
    pas oubliés.
  - **État de repli des `CarteRepliable` non persisté** : perdu à la
    navigation, comme l'aurait été un `<details>` natif (voir ADR-092) — pas
    une régression, juste un confort non ajouté.

- **Flake E2E `dashboard-home.spec.ts:143` (mobile-safari), reproduit et
  confirmé bénin (2026-08-07, `chantier/apparence-dashboard`)** — le test
  « cashier : /dashboard redirige vers la caisse (comportement préexistant) »
  a échoué une fois sur la campagne E2E ciblée WSL de ce chantier (35 passed
  / 1 skipped / 1 failed). Le titre du test porte déjà la mention
  « comportement préexistant » : le flake n'est pas causé par ce chantier
  (aucun fichier touché sur le chemin caisse/redirection). Rejeu isolé ×3 :
  7/7 vert avec le dernier commit inclus — non bloquant, consigné pour
  mémoire si la même spec retombe.

- **Refonte clarté espace commerçant — dette laissée hors périmètre
  (2026-08-07, `chantier/clarte-commercant`)** — consignée telle
  qu'identifiée lors de la cartographie préalable (7 explorateurs), pas
  causée par ce chantier :
  - **Vrai wizard de création multi-écrans absent** : la page de
    configuration d'une campagne porte encore ~70 contrôles sur un seul
    écran ; remplacement proposé comme lot suivant, arbitrage produit
    nécessaire (pas un simple geste d'ingénierie).
  - **Boutons « Enregistrer » multiples sans état global** : 8 sur la page
    pronostics, un par case du calendrier de l'Avent — chantier
    d'ingénierie dédié à part entière.
  - **Textes d'emails promis par les modèles jamais affichés** après
    application d'un modèle de campagne.
  - **Dates d'un modèle démarrant à l'application, pas à l'activation** de
    la campagne créée à partir de lui.
  - **QR non généré automatiquement** à la création d'une campagne.
  - **Parrainage invisible dans la navigation** : le module fonctionne
    (mécanique déjà branchée) mais n'a ni page dédiée ni entrée de menu
    pour le commerçant.
  - **9 cartes de caisse non unifiées** : la garde `caisse-remise` devra
    être réécrite en dérivé d'un composant commun avant toute unification
    visuelle.
  - **`PageHeader` non généralisé aux pages détail** : posé sur les pages
    liste par ce chantier (lot B), le reste de la dette de direction
    artistique (3 générations visuelles coexistantes, ~175 occurrences
    legacy relevées) n'a pas été repris.

- **Flake E2E `campaign-templates.spec.ts` (mobile-chrome), observé une
  fois puis reparti (2026-08-07, `chantier/clarte-commercant`)** — un run
  CI a vu `toHaveURL` échouer après le délai par défaut de 30 s sur ce
  spec, avant que le run suivant (code identique) ne repasse au vert. Pas
  reproduit une deuxième fois, pas de cause identifiée. À surveiller : si
  la même spec retombe, `campaign-templates.spec.ts:76` utilise déjà un
  locator fragile (`div.justify-between`) signalé comme candidat à une
  réécriture en rôle/landmark (voir le design doc du chantier) — première
  piste à vérifier avant d'ouvrir une investigation plus large.

- **Le libellé du lot est du texte libre, dans un message déclaré
  transactionnel (2026-08-01)** — trouvé par la quatrième contre-revue, après
  le reclassement décidé par le client. `prizes.label` est saisi par le
  commerçant et composé tel quel dans le SMS de code de retrait
  (`src/lib/sms-prize.ts`). Un libellé rédigé comme une accroche — « Revenez
  vite, -20 % ce week-end ! » — partirait donc à 23 h 30 sous l'étiquette
  *transactionnel*, c'est-à-dire hors de la fenêtre horaire que cette
  étiquette permet précisément de sauter. **Ce que la qualification repose
  sur reste vrai** : le message part à la suite d'une action explicite du
  joueur et porte le code qu'il doit présenter en caisse (ADR-061) ; c'est le
  *libellé* qui pourrait le contredire, pas le gabarit.
  **Pourquoi ce n'est pas traité** : l'exposition est d'**un SMS par
  gagnant**, à un client qui a consenti, payé par le commerçant lui-même —
  celui-là même qui a écrit le libellé. Il n'y a ni volume, ni tiers lésé, ni
  gain pour qui le ferait. Modérer un champ libre à ce prix coûterait plus
  cher que le risque.
  **Ce qui le ferait rouvrir** : un second producteur de SMS injectant du
  texte commerçant, ou un volume qui rendrait la pratique visible d'un
  opérateur. Le jour venu, la réponse n'est pas de modérer le libellé mais de
  composer le message **sans** lui (le code et l'enseigne suffisent).

- **`revoke all … from public, anon` ne retire pas `service_role` — écart
  documentation/base, pas une escalade (2026-07-31)** — mesuré en base, pas
  déduit : `pg_default_acl` montre que Supabase pose un
  `alter default privileges … grant all on functions to postgres, anon,
  authenticated, service_role`. Conséquence : 217 des 231 fonctions du schéma
  `public` portent `service_role=X`, alors que l'idiome `revoke all … from
  public, anon` apparaît 81 fois dans 26 fichiers et que 4 occurrences
  seulement révoquent explicitement `service_role`. **Ce n'est pas une
  escalade de privilège** — `service_role` contourne déjà la RLS et accède
  aux tables en direct — c'est un écart entre ce que le code dit faire et ce
  que la base fait réellement. Décision : les quatre fonctions du chantier du
  2026-07-31 portent le revoke écrit ; les 77 autres sites ne sont **pas**
  touchés, une migration de masse coûterait plus qu'elle ne prouverait. Voir
  ADR-049 pour la vérification (`select proacl from pg_proc …`) et le
  raisonnement complet.
- **Quiz : Sybil économique — les lots ne sont pas garantis à des humains
  DISTINCTS (FAIBLE assumé)** — 2026-07-25 (revue sécurité, ADR-040). L'identité
  d'un joueur est un cookie gratuit et le corrigé lui est dû dès sa réponse : rien
  n'empêche N identités jetables de franchir le seuil. Le plafond est et reste
  `reward_stock` (ADR-031) — l'émission ne peut pas dépasser le stock configuré —
  et Turnstile sur la clôture (`finishQuiz`, seulement si un lot est en jeu)
  réduit la surface. **Sans clés Turnstile provisionnées, aucun challenge n'est
  présenté** : compromis identique à celui déjà assumé pour la fidélité et le
  jackpot.
- **Quiz : aucune borne minimale de temps humain en SQL (FAIBLE assumé)** —
  2026-07-25 (ADR-040). Le chronomètre est serveur-autoritatif et plafonne le
  temps, mais rien ne rejette une réponse « trop rapide pour un humain » : un bot
  garde l'avantage sur les modes `ranking` et `draw`, dont le départage est
  précisément la rapidité.
- **Quiz : `out_of_stock` est TERMINAL pour le joueur touché (FAIBLE assumé)** —
  2026-07-25 (ADR-040). Un joueur qui termine alors que le stock est épuisé n'est
  plus doté **même après réapprovisionnement** : l'unicité (quiz, joueur) empêche
  une seconde émission (même patron que le calendrier). À documenter côté
  commerçant : réapprovisionner ne rattrape pas les joueurs déjà passés.
- **Quiz : purge par ANONYMISATION, pas par suppression (FAIBLE assumé)** —
  2026-07-25 (ADR-040). Au-delà de la rétention, le hash du jeton, le score, les
  temps, les réponses non libres (`choice` / `number` / `ranking`) et le registre
  des codes SURVIVENT ; seuls prénom, email, avatar, opt-in et réponses `text`
  sont neutralisés. Arbitrage assumé au regard du registre de caisse (un code
  `QUIZ-…` doit rester vérifiable).
- **Quiz : `consume_quiz_spin_grant` ignore l'état de la roue / campagne cibles
  (FAIBLE assumé)** — 2026-07-25 (ADR-040). Miroir du calendrier : un tour de roue
  offert peut atterrir sur une roue mise en pause ou une campagne inactive. Sans
  effet économique (le tirage reste borné par les lots et stocks de la roue), mais
  déroutant pour le joueur.
- **Quiz : prénom joueur affiché au classement, non modéré (INFO)** —
  2026-07-25 (ADR-040). Identique aux pronostics et au mode événement : le prénom
  saisi est rendu tel quel dans le classement public (React échappe, donc pas de
  XSS) ; aucune modération, aucun filtre de grossièreté.
- **Quiz : dérogation au trigger de gel des réponses (INFO, par conception)** —
  2026-07-25 (ADR-040). `quiz_answers_freeze` refuse toute réécriture d'une
  réponse, y compris au `service_role` — sauf une transition purement
  DESTRUCTIVE : la purge peut vider une réponse `text`, et seulement cela (toutes
  les autres colonnes doivent rester identiques, sinon refus). Verrouillé par deux
  tests pgTAP.
- **Quiz : `setMerchantCompAccess` ne couvre que 4 des 8 addons (INFO,
  PRÉ-EXISTANT)** — 2026-07-25 (`b483740`). L'« accès offert » du back-office
  n'accorde que `addon_pronostics`, `addon_hunts`, `addon_loyalty` et
  `addon_jackpot` ; les 4 autres (événement, calendrier, parrainage, quiz) ne
  s'obtiennent que par leur bascule dédiée. Incohérence antérieure au chantier, à
  reprendre d'un seul geste.
- **Modèles de campagne : un blueprint PRIVÉ peut décrire une roue sans lot
  perdant (FAIBLE assumé)** — 2026-07-25 (revue sécurité, ADR-039). Le CATALOGUE
  Lastchance respecte ADR-031 (4 lots gagnants à stock fini + 1 lot perdant
  inépuisable, testé), mais rien n'empêche un modèle privé de décrire une roue
  sans lot perdant ou à gagnant illimité. Pas une escalade : le même éditeur peut
  déjà créer cette roue dans l'éditeur de lots — auto-préjudice, aucun effet
  inter-tenant.
- **Modèles de campagne : application NON TRANSACTIONNELLE (FAIBLE assumé)** —
  2026-07-25 (ADR-039). Si l'INSERT de la roue ou des lots échoue après la
  création de la campagne, un brouillon orphelin subsiste (même patron que
  `createCampaign`). Sans effet jouable : la campagne est en `draft`, sans QR
  code, et le contexte de jeu exige `active`. Durcissement possible : RPC unique
  ou nettoyage à l'échec.
- **Modèles de campagne : ni quota ni rate-limit sur les actions (INFO)** —
  2026-07-25 (ADR-039). `applyCampaignTemplate` et `saveCampaignAsTemplate` ne
  sont ni plafonnées ni rate-limitées, aligné sur `createCampaign` (les actions
  dashboard ne le sont pas par convention). Le volume reste borné par la borne de
  32 Ko du blueprint et par l'unicité du nom par organisation.
- **Modèles de campagne : le secret d'un jeu de défi est DUPLIQUÉ dans le
  blueprint (FAIBLE assumé)** — 2026-07-25 (revue sécurité, ADR-039). Après le
  correctif `4457b20`, la confidentialité du secret repose entièrement sur la
  policy éditeurs de `campaign_templates`. L'option « ne pas sérialiser le
  secret » a été écartée pour la V1 (un modèle reproduirait alors un défi
  incomplet). À reconsidérer si la table s'ouvre un jour à d'autres rôles.
- **Modèles de campagne : seule la roue PRINCIPALE est capturée (INFO,
  fonctionnel)** — 2026-07-25 (ADR-039). `saveCampaignAsTemplate` sérialise la
  première roue par position : un modèle porte une mécanique, pas une grille
  multi-roues. Assumé pour la V1.
- **Modèles de campagne : « Utiliser ce modèle » visible pour un caissier (INFO,
  ergonomie)** — 2026-07-25 (ADR-039). La galerie affiche le bouton à un caissier
  qui ne peut pas l'appliquer (l'action refuse en owner|editor). Comportement
  préexistant du bouton « + Nouvelle campagne » juste à côté ; à traiter d'un
  seul geste pour les deux.
- **Pronostics : `update_contest_event_settings` peut ROUVRIR une question
  (M2, FAIBLE assumé)** — 2026-07-24 (revue sécurité, ADR-038). Déplacer
  `default_locks_at` vers le futur sur un championnat verrouillé (motif d'audit
  exigé) rouvre les questions génériques dont `locks_at` est NULL. Atténuations
  réelles : l'UI écrit TOUJOURS `locks_at` à la création d'une question (il
  faudrait un INSERT PostgREST direct pour l'éviter), une question résolue reste
  fermée, l'opération est journalisée avec son motif, et c'est de
  l'auto-traitement sur son propre tenant. Durcissement possible : refuser le
  report d'une question déjà verrouillée.
- **Pronostics : `scoreAnswer` / `scorePrediction` sans appelant en production
  (I1, INFO)** — 2026-07-24 (revue sécurité, ADR-038). Les points sont écrits
  EXCLUSIVEMENT en SQL (`contest_generic_points`) ; les fonctions TS sont un
  miroir de test et d'affichage. La parité SQL↔TS a été vérifiée ligne à ligne
  (aucune divergence) mais n'est garantie que par les tests unitaires — une
  divergence future ne serait pas détectée par le runtime.
- **Pronostics : départage d'ex æquo par PALIER et non par TYPE (INFO)** —
  2026-07-24 (ADR-038, ADR-013). `exact_count` / `diff_count` comptent les
  paliers du barème, pas les types de question. Strictement inchangé sur un
  championnat 100 % football ; imprécis seulement sur un événement MIXTE
  (questions `score` + génériques).
- **Pronostics : `number_tolerance` décimal ignoré au calcul (I2, INFO)** —
  2026-07-24 (revue sécurité, ADR-038). La tolérance d'une question `number`
  accepte un décimal à l'écriture mais n'est utilisée qu'en entier au calcul.
  Non atteignable via l'UI ni via PostgREST. À aligner à l'occasion.
- **Pronostics : nouvelles RPC hors de l'audit ACL central (I4, INFO)** —
  2026-07-24 (revue sécurité, ADR-038). `submit_contest_answer`,
  `set_contest_question_result`, `update_contest_generic_scoring` et
  `update_contest_event_settings` sont couvertes par
  `supabase/tests/generic_contests.test.sql` mais pas par
  `security_acl.test.sql`, qui reste l'inventaire de référence des grants. À
  rapatrier.
- **Pronostics : `tiebreaker_answer` chargé dans le contexte public (I5, INFO,
  PRÉ-EXISTANT)** — 2026-07-24 (revue sécurité, ADR-038). La réponse officielle
  de la question subsidiaire est SELECTée par `pronostics-context.ts` mais n'est
  jamais transmise au client (projections explicites côté composants). Aucune
  fuite constatée ; durcissement souhaitable : la retirer de la projection.
- **E2E `pronostics.spec.ts` : locator page-wide ambigu (FRAGILITÉ
  PRÉ-EXISTANTE, hors chantier)** — 2026-07-24. `e2e/pronostics.spec.ts:40`
  attend `/Enregistré|Modifier/` sur toute la page, alors que le hub joueur
  porte un bouton « Modifier » PERMANENT : risque d'ambiguïté Playwright
  (strict mode). Non touché par le chantier générique — à trancher au premier
  run CI.
- **`wheels.theme` (colonne morte)** — 2026-07-11. Colonne jsonb du schéma
  initial, remplacée par `wheels.style` (00006) et plus lue nulle part.
  Sans danger ; à supprimer dans une future migration de ménage.
- **Bucket `logos` accepte `image/svg+xml`** — 2026-07-11. L'action
  d'upload ne permet que PNG/JPEG/WebP et les écritures passent
  exclusivement par le service role : l'écart est sans effet. À aligner
  à l'occasion.
- **`birth_date` écrasable via le claim** — 2026-07-21 (revue sécurité,
  FAIBLE assumé). Un gagnant qui claim avec l'email d'un abonné existant
  de la même organisation peut écraser sa `birth_date`. Impact limité :
  mauvaise date de vœux d'anniversaire. Durcissement possible : ne poser
  `birth_date` que sur une ligne créée par le claim. Voir ADR-019.
- **Minimisation RGPD de `birth_date`** — 2026-07-21 (revue sécurité,
  FAIBLE assumé). L'année complète est stockée alors que jour + mois
  suffiraient au scénario anniversaire. Évolution possible notée dans
  l'ADR-019.
- **Contention du verrou de `record_hunt_scan` sous forte affluence** —
  2026-07-22 (revue sécurité, INFO/perf). Chaque scan pose un `for update`
  sur la ligne de la chasse (nécessaire pour sérialiser l'attribution du
  lot final et du stock). Sous très forte affluence simultanée sur une même
  chasse, les scans se sérialisent. À surveiller ; optimisation possible
  (ne verrouiller que la branche complétion) si la charge réelle le justifie.
- **Réordonnancement impossible en une passe sur une chasse pleine** —
  2026-07-22 (INFO, ergonomie). `planReorder` réattribue les positions une
  par une vers un slot libre ; sur une chasse de 10 étapes (aucun slot
  libre), une permutation qui ne peut se décomposer sans conflit d'unicité
  échoue avec invitation à déplacer les étapes une par une. Limitation
  d'UX, pas de perte de données.
- **Grants de spin injouables : `reward_claimed_count` non restitué** —
  2026-07-23 (FAIBLE assumé, défaut d'exploitabilité, pas une faille). Le stock
  d'un palier `spin` est décompté à l'ÉMISSION du grant (sous le verrou du
  programme). Si ce grant s'avère ensuite durablement injouable (roue ne
  proposant que des lots illimités, ou campagne cible fermée), il reste NON
  consommé et rejouable, mais l'unité de stock déjà décomptée n'est pas
  restituée : le plafond du palier se vide de grants qui ne produisent aucun
  tour. Impact : sous-distribution du palier — jamais de sur-distribution ni de
  perte de sécurité. Durcissement possible : restituer le compteur quand un
  grant devient définitivement injouable.
- **UX du transfert de coût d'un tour offert gagnant** — 2026-07-23 (INFO/UX).
  Un tour offert GAGNANT prélève une unité du stock de la campagne publique
  ciblée et s'impute à son budget (ADR-031). Le commerçant fixe ce transfert et
  il est désormais annoncé dans l'éditeur, mais l'ergonomie de ce couplage
  stock/budget croisé (fidélité → campagne) reste à affiner.
- **Jackpot : scans post-`date_draw` incrémentent la jauge cosmétique sans
  gain** — 2026-07-23 (FAIBLE assumé V1, ADR-033). Après un tirage à date
  (one-shot), la campagne reste `active` pour que le gagnant asynchrone récupère
  son code ; les participations ultérieures continuent d'incrémenter la jauge
  partagée mais ne peuvent plus produire de gain (garde
  `not exists jackpot_wins`). Compromis découlant du tirage unique. Suite ouverte
  (roadmap) : afficher un état « tirage effectué » et/ou stopper les
  participations après `draw_at`.
- **Jackpot : stock résiduel d'un `date_draw` non distribué** — 2026-07-23
  (FAIBLE assumé V1, ADR-033). Le tirage à date est UNIQUE (un seul gagnant) :
  si `reward_stock > 1`, le stock résiduel reste non attribué. Impact :
  sous-distribution du lot — jamais de sur-émission ni de perte de sécurité.
  Limite V1 assumée.
- **Événement live : capture du podium par sybil multi-cookie (MOYEN assumé
  V1)** — 2026-07-23 (revue sécurité, ADR-034). Le join étant public et anonyme,
  un script gérant N cookies peut répartir des pantins sur les options et
  soumettre à `elapsed≈0` (bonus de vitesse maximal) pour rafler le podium.
  **Borne économique intacte** : jamais plus de gagnants que `reward_stock`
  (fini), et le lot est remis physiquement en caisse par le staff — enjeu
  d'ÉQUITÉ, pas de fuite d'argent. Parade optionnelle (roadmap) : Turnstile au
  1er join (clé identité, compatible ADR-032), sans friction sur le re-join.
- **Événement live : joueurs fantômes / oracle de `join_code` (INFO)** —
  2026-07-23 (revue sécurité, ADR-034). Des cookies neufs créent des lignes
  `event_players` (score 0, hors top classement, purgées après la session) ; le
  join distingue « code connu » de « inconnu ». Tradeoffs ADR-032 assumés — les
  `join_code` ne sont pas secrets (imprimés sur le QR au comptoir).
- **Calendrier : UUID des cases (`dayIds`) exposés au client, futurs compris
  (FAIBLE assumé V1)** — 2026-07-23 (revue finale, ADR-035). La grille envoie au
  client les UUID de toutes les cases, y compris verrouillées. Neutralisé :
  `open_calendar_box` sur un UUID verrouillé renvoie `too_early` SANS aucun
  contenu (le gating est serveur-autoritatif). Les restreindre casserait le
  déverrouillage à minuit page ouverte (les `dayIds` ne sont pas rafraîchis par
  le poll). Aucun contenu ni code n'est jamais divulgué — résidu accepté.
- **Calendrier : purge RGPD conditionnée à l'archivage (FAIBLE assumé V1)** —
  2026-07-23 (revue finale, ADR-035). `purge_expired_calendar_players` ne purge
  que les calendriers `archived`, et l'archivage automatique des calendriers
  écoulés n'a lieu que pour les organisations à `data_retention_months` non nul
  (opt-in commerçant). Un commerçant qui n'archive jamais et n'a pas fixé de
  rétention fige la purge de ses joueurs de calendrier. Compromis assumé, aligné
  sur la borne « dernière activité » du Passeport (un calendrier vit dans la
  durée). Durcissement possible : archivage/purge par défaut au-delà d'une borne.
- **Parrainage : dédup EMAIL inerte dans le flux post-spin (FAIBLE assumé V1)** —
  2026-07-24 (revue sécurité, ADR-036). `validateReferral` est appelé APRÈS le spin
  du filleul (donc avant le claim qui collecte l'email), si bien que `filleul_email`
  est toujours absent au moment de la validation : la dédup email SQL, présente et
  correcte, n'est jamais alimentée. Résidu ACCEPTABLE — la dédup email ne borne PAS
  le vecteur multi-devices (décorative) ; la vraie borne est stock fini + plafond +
  fenêtre + spin rate-limité. Impact : aucun (la sécurité ne dépend pas d'elle).
  Amélioration possible : câbler l'email au claim (best-effort). Suite ouverte
  (roadmap).
- **Parrainage : amplification ~3× des tirages en config spin+spin (FAIBLE assumé
  V1)** — 2026-07-24 (revue sécurité, ADR-036). Avec les versements parrain=`spin`
  ET filleul=`spin`, les tours offerts contournent `play_limit` (comme fidélité /
  calendrier) et multiplient les tirages sur la roue de la campagne. BORNÉE par le
  stock fini des lots de la roue (ADR-031). Note de dimensionnement commerçant :
  garder ≥ 1 lot à stock fini sur la roue, sinon `no_prize` sur les tours offerts.
- **Parrainage : entropie du `referral_code` = 40 bits (INFO)** — 2026-07-24 (revue
  sécurité, ADR-036). Le code partageable `PR-…` (8 caractères sur un alphabet de 32)
  vaut 40 bits d'entropie : suffisant pour un identifiant PARTAGEABLE et non secret
  (≠ `spin_grant_token`, 192 bits, qui reste le secret anti-rejeu du tour offert).
  Aucun impact — le code de parrainage n'est pas un secret.
- **Jeux rapides : `reflex` / `gauge` = réussite *client-reported* (FAIBLE assumé
  V1)** — 2026-07-24 (revue sécurité, ADR-037). L'issue de ces deux défis (temps de
  réaction, arrêt d'une jauge) est rapportée par le client, non vérifiable serveur.
  BORNÉE par l'économie (ADR-031) : un bot qui « réussit » toujours obtient au mieux
  un tirage NORMAL par participation (baseline roue), jamais au-dessus des poids /
  stock configurés. Enjeu d'équité du défi, pas de fuite d'argent. Durcissement
  possible : preuve serveur (horodatage `start` → `submit`) pour `reflex`.
- **Jeux rapides : jeux à secret exigent un `play_limit` borné (FAIBLE assumé
  V1)** — 2026-07-24 (revue sécurité, ADR-037). `mystery_word` / `estimate` /
  `puzzle` portent un secret serveur ; `play_limit = unlimited` y est INTERDIT
  (sinon jeton rejouable → brute-force). Verrou produit + sécurité assumé — le
  commerçant perd la liberté de configurer ces jeux en illimité.
- **Jeux rapides : verrouillage du défi sur erreur transitoire au submit (FAIBLE)** —
  2026-07-24 (revue sécurité, ADR-037). Sur une erreur transitoire au
  `submitSkillChallenge`, le composant de défi se verrouille alors que le shell
  prévoyait un ré-essai ; recharger la page relance un défi (`startSkillChallenge` ne
  consomme rien, aucune perte). Divergence UX mineure à surveiller.
- **Caisse pronostics : l'éditeur déroge à l'expiration du code (FAIBLE assumé)** —
  2026-07-25 (revue sécurité, ADR-043). `set_contest_award_status('delivered')` ne
  teste pas `redeem_expires_at` : un owner peut honorer depuis le dashboard un code
  périmé, que `redeem_contest_award` refuserait au comptoir. Assumé — le TTL protège
  le commerçant, c'est donc à lui d'en déroger.
- **Caisse pronostics : aucune garde `hasPronosticsAccess` sur la remise (FAIBLE
  assumé)** — 2026-07-25 (ADR-043). Un abonnement expiré n'empêche pas de remettre un
  lot déjà émis. **Cohérent avec les 8 autres sources de caisse** : on n'annule pas
  des lots dus à des joueurs parce que le commerçant a cessé de payer.
- **Caisse : bascule de tie-break sur les codes NUS (FAIBLE assumé)** — 2026-07-25
  (ADR-043). Une saisie de 8 caractères sans préfixe résout désormais vers les
  pronostics **avant** le repli roue. Comportement voulu et testé (`(k ter)`), mais
  c'est un changement de résolution pour les saisies non préfixées.
- **Pronostics : un lot ANNULÉ est présenté au joueur comme encaissable (FAIBLE,
  PRÉEXISTANT)** — constaté 2026-07-25 (ADR-043). `src/app/pronos/[slug]/page.tsx`
  écrase le statut `cancelled` en `pending` côté joueur : celui-ci se déplace avec un
  code que la caisse refusera (à raison). Défaut d'**UX**, pas de sécurité —
  antérieur au chantier, non introduit par lui.
- **Caisse : les REFUS de remise ne sont pas audités (FAIBLE, dette transverse)** —
  2026-07-25 (ADR-043). `redeem_contest_award` n'écrit dans `audit_logs` qu'en cas de
  remise effective ; un code expiré, annulé ou déjà remis ne laisse aucune trace.
  Dette **partagée** avec `redeem_quiz_reward` — à traiter au niveau du module de
  caisse, pas d'une source.
- **Pronostics : `finalize_contest` sans boucle anti-collision sur le code (FAIBLE
  assumé)** — 2026-07-25 (ADR-043). Le nouvel index unique
  `(organization_id, code)` élargit la portée anti-collision de « par championnat » à
  « par organisation » alors que la clôture ne reprend pas un code déjà pris
  (~5·10⁻⁷ pour 1 000 lots). La clôture avorte en transaction et reste **rejouable** :
  aucune perte de données, un simple ré-essai.
- **`set_contest_award_status` scopé sans revérifier `contests` (FAIBLE)** —
  2026-07-25 (ADR-043). Même classe que M1 ci-dessus, impact bien moindre : la RPC
  éditeur filtre sur `(award_id, organization_id)` sans revalider le championnat,
  mais elle n'expose aucune donnée et n'écrit que des UUID.
- **✅ CLOS le 2026-08-01 (ADR-058, branche `feat/canal-sms-utilisable`) —
  Canal SMS : facturation au crédit, pas au segment.** Texte d'origine
  conservé ci-dessous car il pose correctement le problème. Le grand livre
  débite désormais exactement le nombre de segments réels (`smsSegments()`,
  calculé côté serveur avant toute réservation, 1 à 6, refus au-delà) au
  lieu d'un forfait d'une unité par message. Reste ouvert en corollaire :
  `sms.claim_refused` ne distingue toujours pas « crédit épuisé » de
  « STOP », et un solde de 2 fait maintenant disparaître en silence un
  message de 3 segments (un accent dans un nom de lot suffit à basculer en
  UCS-2) — le compteur ne dit pas pourquoi.
  *Texte d'origine* : 2026-08-01 (ADR-056, PR #80). Le grand livre débite
  exactement 1 crédit par envoi ; Brevo facture réellement au segment SMS
  (un texte long consomme plusieurs segments). Assumé pour la livraison
  initiale — écart de coût potentiel entre le solde affiché et la facture
  Brevo réelle, jamais un écart de sécurité.
- **Canal SMS : mention STOP sans numéro court réel (FAIBLE, temporaire —
  correctif de code livré depuis, relu 2026-08-01)** — 2026-08-01 (PR #80).
  Le texte de consentement annonce un retrait par STOP mais ne peut pas
  encore citer le numéro court du prestataire tant que le compte Brevo n'est
  pas ouvert. **La dernière phrase de cette entrée (« se résorbe à
  l'ouverture du compte, pas un correctif de code ») est périmée depuis
  PR #82** : `smsStopShortcode()` (`src/lib/sms-dispatch.ts:191-196`) refuse
  désormais tout SMS publicitaire ne portant pas le numéro une fois la
  variable `SMS_STOP_SHORTCODE` posée, et l'écran commerçant
  (`src/app/dashboard/settings/sms/page.tsx:187-196`) affiche l'absence du
  numéro au lieu de la taire. Ce qui reste réellement ouvert, et appartient
  au client : tant que la variable n'est pas posée, `stopMention(null)`
  compose « STOP pour ne plus en recevoir. » alors que le texte de
  consentement lu par le joueur promet « STOP au numéro court indiqué dans
  chaque message » (`src/lib/validations/sms.ts:51-54`, rendu par
  `claim-form.tsx:350`) — l'écart entre les deux textes **subsiste
  réellement**, seule sa gravité a changé : il est désormais **borné** (le
  code refuse d'envoyer un publicitaire sans numéro dès que la variable
  existe) plutôt qu'irréparable sans code.
- **✅ CLOS le 2026-08-01 (branche `feat/canal-sms-utilisable`) — Canal SMS :
  achat de crédits manuel, pas de parcours Stripe.** Packs Stripe
  (100/500/2000 SMS) ajoutés, catalogue piloté par variables
  d'environnement — un pack sans variable n'est pas proposé plutôt que
  d'échouer au clic. Webhook `checkout.session.completed` crédite via
  `credit_sms_balance`. **Rouvre un point** : le rejeu de ce webhook après
  une panne réseau peut créditer deux fois (voir High Priority ci-dessus),
  et un mode de paiement à notification différée peut encaisser sans
  créditer (voir Medium Priority) — l'achat existe, il n'est pas encore
  fiabilisé.
  *Texte d'origine* : 2026-08-01 (PR #80). Seul le back-office plateforme
  peut créditer un solde SMS aujourd'hui ; aucune recharge en libre-service
  côté commerçant.
- **`weekly-digest` inscrit au registre de supervision mais non actif (FAIBLE,
  temporaire)** — 2026-08-01 (ADR-057, PR #80). Même règle qu'ADR-053 : un
  worker n'est supervisé qu'après avoir déposé un premier succès. Sans
  commerçant réel avec activité mesurable (voir le constat de production
  ci-dessous), ce premier succès peut tarder.
- **Production mesurée : un seul compte, aucun commerçant réel (constat, pas un
  bug)** — 2026-08-01 (PR #80). En instrumentant le canal SMS et le
  portefeuille, la production a été lue directement : 1 organisation, 1 compte
  utilisateur, 1 participation, 4 spins, 2 lignes au registre des récompenses,
  abonnement en essai — le compte de test du propriétaire. Le produit porte
  quinze modules, plus de 2 200 tests et 99 migrations, et zéro client réel à
  ce jour. Consigné ici pour qu'aucun futur chantier ne présume une base
  d'utilisateurs qui n'existe pas.
- **QR de commande : la page `/commande/[token]` distingue jeton valide et
  invalide par 404/200 (FAIBLE assumé)** — 2026-08-06 (revue sécurité,
  ADR-087). Identique au motif déjà assumé sur `/hunt` : la page publique
  rend un statut HTTP différent selon que le jeton existe ou non, ouvert à
  quiconque essaie des jetons, sans franchir de challenge. Le risque réel
  est borné par la longueur du jeton (`^[A-Za-z0-9-]{8,64}$`, entropie
  élevée) et par l'usage unique atomique porté par `consumed_at` — un jeton
  deviné ne rapporte qu'un tampon, pas un accès continu.
- **QR de commande : ni péremption ni révocation de jeton en MVP (FAIBLE
  assumé)** — 2026-08-06 (ADR-087). Un jeton de commande créé reste
  utilisable indéfiniment jusqu'à consommation (usage unique) ; la
  suppression a été explicitement bloquée (`revoke delete from
  authenticated`, FAIBLE 2 fermé) pour empêcher la résurrection d'un jeton
  déjà dépensé, mais aucun mécanisme ne permet à un commerçant d'invalider
  un jeton émis par erreur avant qu'il ne soit scanné.
- **QR de commande : le jeton voyage dans l'URL de `/commande/[token]`
  (INFO, motif préexistant)** — 2026-08-06 (ADR-087). Même exposition que
  `/hunt` : PostHog reçoit l'URL complète si le joueur a consenti au
  tracking analytique ; pas de fuite via l'en-tête Referer
  (`Referrer-Policy` strict, motif déjà en place sur les autres liens à
  jeton du produit).

- **Retours propriétaire — hors périmètre assumé et dette documentée
  (2026-08-08, `chantier/retours-proprietaire`)** :
  - **Mode TV pronostics sans thème** : `loadContestTvContext` n'expose pas
    `theme` (déjà noté V1.49) — non repris par ce chantier.
  - **Branche « nuit » de `/play` sans décor ni lavis** : seul le décor par
    preset kermesse a été livré ; un lavis de fond pour la variante nuit
    reste à arbitrer côté produit.
  - **Préférence d'invitation avant-jeu par navigateur (`sessionStorage`),
    pas par joueur identifié** : un même joueur sur deux appareils revoit la
    carte d'invitation sur chacun ; assumé, cohérent avec la nature
    non bloquante de la mécanique.
  - **Valeurs de lien déjà en base hors de la nouvelle liste blanche
    d'hôtes** cessent d'être servies publiquement dès ce chantier (revalidées
    à la lecture, voir ADR-094) sans avertissement au commerçant qui les
    aurait saisies avant le resserrement. Impact nul mesuré : la production
    ne compte qu'une organisation de test.
  - **Dette `TRUNCATE` table-level héritée de la migration `00018`** :
    relevée en INFO par la revue sécurité de ce chantier lors de l'examen de
    `20260918120000_invitation_prejeu.sql`, préexistante et hors de son
    périmètre. Un `TRUNCATE` sur une table portée par cette migration
    ancienne agit au niveau table plutôt que ligne — à vérifier par
    `db-supabase` (impact potentiel : cascade ou perte de granularité RLS
    selon la table visée, non caractérisé plus finement ici).

## Tracking Process

### When a bug is found:
1. Add to this file with date discovered
2. Describe reproduction steps
3. Note expected vs actual behavior
4. Link related decisions or architecture notes
5. Update severity as more info is gathered

### Closing a bug:
1. Reference commit/PR that fixes it
2. Move to "Resolved" section below
3. Keep for historical reference

---

## Resolved Bugs

- **`/api/scan` sans rate limiting** — résolu avant la revue 2026-07-18.
  Le compteur est limité par slug et IP, avec verdict fail-closed.

- **Deux migrations partageaient le préfixe `00006`** — trouvé/résolu
  2026-07-11 (revue CTO). `00006_branding_and_customization.sql` et
  `00006_qr_style.sql` : le versionnage Supabase utilise le préfixe
  numérique comme clé — `supabase db push` échoue sur un environnement
  neuf. Renommé `00006_qr_style.sql` → `00007_qr_style.sql` (l'ordre
  d'application réel est inchangé : qr_style est arrivée après branding).
- **Fuite de stock si l'insertion du spin échoue** — trouvé/résolu
  2026-07-11 (revue CTO). Le stock d'un lot était réservé
  (`decrement_prize_stock`) avant l'insertion dans `spins` ; si cette
  insertion échouait (incident base), la réservation était perdue : une
  unité de stock disparaissait sans gagnant. Ajout de
  `restore_prize_stock` (migration 00008) appelée dans le chemin
  d'erreur de `spinWheel`.
- **E2E : libellé newsletter erroné** — trouvé/résolu 2026-07-11 (revue
  CTO). `player-flow.spec.ts` cherchait « Je m'inscris à la newsletter »
  alors que l'écran d'engagement affiche « S'inscrire à la newsletter » :
  sur une campagne avec engagement, le test échouait à tort.
- **Modifications commerçant invisibles jusqu'à 30 s sur /play** —
  résolu 2026-07-11 (passe perf React/Next). Le cache ISR n'était purgé
  qu'à expiration ; les server actions purgent désormais les slugs
  concernés (`revalidatePlaySlugs`).

---

## Notes
- Regular triage recommended once active development starts

- **Douzième occurrence — et la première où le NETTOYAGE du contrôle négatif
  est lui-même dangereux (2026-08-03, `chantier/solde-bugs`)**. Un sabotage
  par `perl -0pi` **n'a pas mordu** (regex multiligne, cause déjà vue), et le
  `git checkout --` de nettoyage qui a suivi **a écrasé le travail en cours**
  sur le fichier — restauré depuis une copie prise avant sabotage. C'est la
  **douzième** occurrence du motif « le détecteur ment » sur les cinq derniers
  chantiers, mais la première où le coût n'est pas une conclusion fausse : une
  perte de travail.

  **La leçon n'est pas « ne pas saboter »** — les contrôles négatifs restent la
  seule preuve qu'un test mesure quelque chose. Elle tient en deux gestes :
  **prendre la copie AVANT le sabotage**, et **ne jamais nettoyer un sabotage
  par un `git checkout --` sur un fichier qu'on est en train d'éditer** — la
  commande ne distingue pas la ligne sabotée du travail non commité qui
  l'entoure. Restaurer depuis la copie, ou committer avant de saboter.

- **Onze occurrences, onze causes différentes — et ce sont les VERTS qui ont
  démasqué les deux dernières (2026-08-03, `chantier/derniers-ouverts`)** —
  deux détecteurs muets de plus, portant le cumul à **onze sur les cinq
  derniers chantiers**, avec **onze causes toutes distinctes**. Les deux
  nouvelles : un `psql -f /mnt/c/…` exécuté **dans** le conteneur, où ce
  chemin n'existe pas — il rendait **0 rouge ET 0 vert**, et c'est le zéro
  vert qui a parlé, le zéro rouge étant indistinguable d'un succès ; et un
  `perl -0777` qui n'a pas mordu, rendant **exactement la ligne de base**,
  donc indistinguable d'un correctif inutile. La pratique adoptée la veille —
  **compter les verts autant que les rouges** — a payé les deux fois.

  **Règle ajoutée, neuve : un contrôle négatif se rapporte avec son
  PROTOCOLE**, pas seulement avec son résultat. QA n'a pas reproduit un
  chiffre annoncé par un agent (4 rouges au lieu de 7) et **l'a dit plutôt
  que de l'arrondir** — c'est la bonne réaction, mais elle n'aurait pas dû
  être nécessaire : le sabotage exact n'était pas décrit (quel fichier, quelle
  ligne, quelle substitution), donc la preuve n'était pas rejouable. Un
  résultat de contrôle négatif sans son protocole n'est pas une preuve, c'est
  une affirmation.

- **Le contrôle négatif qui rend « 0 rouge » : neuf occurrences, et la
  pratique adoptée (2026-08-03)** — deux contrôles négatifs de plus ont rendu
  0 rouge sans que le code soit en cause, portant le cumul à **neuf sur les
  quatre derniers chantiers**. Les deux causes de ce tour sont nouvelles :
  un `perl` qui n'avait pas mordu sur une ligne **accentuée** (deux fois, deux
  agents différents), et un **détecteur muet** — `psql` invoqué sans `-t -A`,
  dont la sortie alignée ne matchait plus : il rendait 0 en ligne de base
  **comme** après sabotage.

  **La pratique retenue : compter les VERTS autant que les rouges.** « Le
  correctif est inutile » et « le détecteur ne mesure rien » rendent tous les
  deux « 0 rouge » ; seul le compte des verts les distingue. Un contrôle
  négatif dont on ne connaît pas le nombre de verts en ligne de base ne
  prouve rien, quel que soit son résultat.

  **Second point, opérationnel : ne pas faire tourner QA et la revue sécurité
  en parallèle.** La revue a observé dans l'arbre de travail des marqueurs
  `SABOTAGE` transitoires — les contrôles négatifs de QA en cours — et a dû
  ancrer explicitement ses conclusions sur le commit plutôt que sur l'arbre.
  Elle l'a fait correctement, mais c'est une occasion de conclusion fausse
  qu'on peut simplement supprimer en séquençant les deux.

- **Le motif, consigné pour ce qu'il est (2026-08-01)** — c'est la
  **quatrième fois** que ce dépôt paie la même forme de défaut : une entrée
  affirme encore un défaut « ouvert » alors que le code l'a fermé un ou
  plusieurs chantiers plus tôt, parfois plusieurs jours avant l'affirmation
  elle-même (le réordonnancement était déjà clos ligne 1523 le jour même où
  la ligne 1830 le redisait ouvert). Chantier `chantier/solder-les-ouverts` :
  27 affirmations relues contre le code vivant, 9 confirmées et corrigées
  (`ff8a722`), 15 déjà closes, 3 fausses dès l'origine (`contest-leagues.tsx`,
  l'exemple ambre du contraste, le forfait SMS à 1 crédit). Une entrée fausse
  coûte plus cher qu'une entrée absente : elle déplace le travail vers un
  problème qui n'existe pas.

  **Proposition, non implémentée** : ce fichier a franchi les 2 700 lignes et
  sa fiabilité se dégrade avec sa taille — au-delà d'un certain volume,
  personne ne relit tout avant d'écrire une nouvelle entrée. Ce qui rendrait
  les affirmations vérifiables *mécaniquement* plutôt que par relecture :
  (1) une syntaxe d'ancrage obligatoire (`fichier:ligne` ou un marqueur de
  commentaire dans le code, comme `// BUG:<id>`) au lieu de citations en
  prose, que la CI peut résoudre et rejeter si le fichier ou la ligne n'existe
  plus ; (2) un script qui, pour chaque entrée non `✅`, vérifie que la
  citation qu'elle porte est encore présente **textuellement** dans le fichier
  visé, et fait échouer la CI sinon (silence = dérive, comme pour
  `revalidate-coverage.test.ts`) ; (3) une durée de vie maximale par entrée
  non close (ex. 30 jours) après laquelle la CI exige une reconfirmation
  explicite plutôt que de laisser une affirmation vieillir sans relecture.

- **E2E calendrier « Pas de chance » en fixme — isolation de seed à faire
  (2026-08-08, `chantier/tuiles-checklist-autosave`)** — le scénario est vert
  au premier passage et faux aux suivants : l'ouverture de la case 1 par le
  passage précédent persiste dans le seed partagé et le joueur suivant reçoit
  l'ancien contenu au lieu de l'écran perdant, base pourtant prouvée vide.
  Pas un défaut produit (sonde : le vide persiste en base depuis la refonte
  du hook signature ; écran perdant couvert en unitaire). Réactivation :
  case dédiée jamais ouverte ou purge des calendar_openings du seed entre
  projets. L'enquête complète vit dans les messages des commits 4d9afe6,
  8019e88, 2d20552 et dans le commentaire du test.

- **Constats d'audit et de revue — partage après jeu (2026-08-08,
  `chantier/partage-apres-jeu`)** — consignés sans action, décisions produit
  en suspens ou hors périmètre du chantier :
  - `?ref=share` reste accepté et compté par les mécaniques d'acquisition
    même quand le commerçant a décoché le partage sur la campagne
    (préexistant à ce chantier — le paramètre d'URL n'est pas conditionné à
    `share_enabled`). Question produit à trancher : le lien déjà en
    circulation doit-il continuer à créditer l'acquisition, ou le retrait du
    partage doit-il aussi couper le tracking ?
  - La suite `security_acl.test.sql` n'a pas d'assertion de liste **fermée**
    des colonnes writables sur `campaigns`/`quizzes` : un grant additif futur
    peut élargir silencieusement la surface UPDATE sans qu'un test rouge le
    signale.
  - Les ligues de pronostics n'ont aucun réglage commerçant sur leurs codes
    d'invitation (ni activation, ni expiration, ni limite) — relevé pendant
    l'audit des 8 surfaces publiques, hors périmètre de ce chantier.
  - Les boutons « Partager » du code de retrait (calendrier, jackpot,
    événement, quiz) restent inconditionnels — assumé : ils ne diffusent que
    le code de retrait du joueur, jamais un lien d'acquisition, donc aucun
    réglage commerçant ne les gate.
  - Aucun test comportemental (E2E ou intégration) ne prouve que
    `share_enabled=false` masque effectivement le bloc `ShareInvite` côté
    joueur ; la couverture actuelle est structurelle (la prop `shareEnabled`
    est requise par le typage, sans défaut composant), choix QA motivé par
    le volume de surfaces à instrumenter plutôt qu'un oubli.
  - `e2e/referral.spec.ts` n'a aucun test tagué `@smoke` : il est donc
    silencieusement absent du projet Playwright `desktop-smoke`, piège de
    filtrage relevé par QA — le fichier a dû être rejoué explicitement hors
    du projet smoke pour être exécuté dans ce chantier.
