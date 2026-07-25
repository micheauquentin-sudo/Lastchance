# Known Issues & Bugs - Lastchance

## Critical
*(None)*

## Resolved

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
*(None)*

## Medium Priority

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

## Low Priority

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
