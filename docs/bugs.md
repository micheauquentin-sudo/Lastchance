# Known Issues & Bugs - Lastchance

## Critical
*(None)*

## Resolved

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

## Low Priority

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
