# Known Issues & Bugs - Lastchance

## Critical
*(None)*

## Resolved

### Le pont d'identité revendique ses orphelines à sa naissance (2026-07-27, `a963583`)

Corrige (et corrige la CAUSE de) l'entrée précédente « la méta-progression ne
peut pas progresser depuis la roue ». Le diagnostic ADR-045 était juste dans
l'effet, faux dans la cause : il affirmait que « les deux systèmes
d'identité — l'ancien par expérience, le nouveau unifié — ne se rencontrent
jamais ». Mesuré contre un vrai Postgres : la résolution `player_id` depuis
`player_legacy_identities` **existait déjà et fonctionnait**, dans
`append_experience_event_internal` (`20260805160000:382-393`), point
d'émission unique des 10 branches d'événements. La vraie cause est un
**ordre d'écriture** : `resolve_player_identity` insère l'adhésion AVANT la
ligne de pont (la FK composite l'impose), or c'est le trigger de l'adhésion
qui portait le rattrapage — il lisait un pont pas encore écrit. Mesuré :
1re résolution → `player_id` nul ; 2e → attribué. Le rattrapage existait,
décalé d'une visite entière — pas absent. Le tout premier tour de roue d'un
joueur neuf (cas le plus fréquent sur un produit à QR code) ne faisait
progresser aucune mission au moment où il avait lieu.

Second défaut trouvé en mesurant, absent du diagnostic ADR-045 initial : le
`select ... into` de résolution NULLifiait aussi `v_source`/`v_qr_code_id`
sur non-correspondance — la source `direct` de la roue était dégradée en
`unknown` sur tout événement émis avant la pose de son pont, faussant
l'attribution d'acquisition à chaque premier passage.

Corrigé par un trigger `AFTER INSERT` sur `player_legacy_identities`
(migration `20260805230000_experience_identity_backfill.sql`), posé là où la
correspondance hash → `player_id` devient vraie, indépendant de l'ordre
d'écriture côté serveur. Vérifié `supabase test db` : **1 804 assertions
PASS** (1 781 avant). **Contrôle négatif** : migration retirée, 8 assertions
tombent — la preuve porte sur le défaut, pas une tautologie. `EXPLAIN`
confirme l'usage des deux index. `EXPECTED_MIGRATION` bumpé à
`20260805230000`. Voir ADR-045 (addendum). **Résiduel** : le test
`e2e/progression.spec.ts` reste en `test.fixme` — non réactivé dans ce
chantier malgré la levée du prérequis.

### Le fondu d'entrée de `/play` traversait l'illisible (2026-07-27, `1cf46cf`)

Troisième défaut d'accessibilité réel de ce chantier (après le bouton
`danger` sous AA et le texte secondaire), celui-ci **en production** (jeux
rapides vague 2, mais touchant tout `/play`). `.play-in` était la SEULE
animation d'entrée de `/play` absente du bloc `prefers-reduced-motion:
reduce` de `globals.css` (22 classes y figuraient, elle manquait). Son
keyframe animait `opacity: 0 → 1` sur 450 ms ; axe replie l'opacité des
ancêtres dans le calcul du contraste, donc tout le petit texte de l'écran
traversait une zone sous le seuil AA — pour tout joueur, y compris SANS
préférence de mouvement réduit. 20 points d'appel dans 5 composants : tous
les parcours `/play`, pas seulement les 14 jeux. Explique l'intermittence
observée en CI : `progression.spec.ts` pose `reducedMotion: "reduce"` et
échappe au fondu, `skill-games.spec.ts` non.

Corrigé : `.play-in` ajouté au bloc `prefers-reduced-motion: reduce`
(`globals.css:601`) ; opacité de départ `0 → 0.75` (le `translateY(14px)`
porte seul l'arrivée — corrige aussi le cas sans préférence de mouvement
réduit) ; jeton `--color-k-muted: #6b6459` (5,4:1 sur crème) sur la grappe
`opacity-*` portant du texte (`puzzle` ×2, `gauge`, `estimate` ×2,
`mystery-word` ×2, `rps`) ; les 4 boutons de validation factorisés dans
`challengeButtonTone()` (`play-theme.tsx`) ; le contournement JS du panneau
de progression (`reducedMotion ? "" : "play-in"`) redevient inconditionnel,
sa raison d'être ayant disparu — le hook `usePrefersReducedMotion` est
conservé, il sert encore une `transition` inline (jauge) hors de portée
d'une feuille de style. Laissé volontairement : `chest-reveal` et
`cups-reveal` gardent `opacity-40` (bouton purement décoratif, aucune règle
de contraste applicable). Voir ADR-046. Diagnostic établi sur pièces,
confirmé par exécution (CI verte).

### Audit 3 — méta-progression, preuve CI en 13 passages (2026-07-27)

La PR #29 (branche `chantier/audit-3`) a été ouverte pour obtenir ce
qu'aucune relecture ne pouvait donner : la preuve d'exécution des 22 suites
pgTAP et des E2E, impossibles en local (Docker Desktop exige un build Windows
≥ 19045, machine figée en LTSC 2021 / 19044). Rien n'avait jamais tourné.
13 passages CI plus tard, la PR est entièrement verte (6/6 jobs) : 22/22
suites pgTAP, 1 781 assertions, E2E verts, 1 304 tests unitaires. L'exécution
a trouvé 8 défauts réels qu'aucune relecture n'avait vus.

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
*(None)*

## Medium Priority

- **🔴 OUVERT — `BORNE 2` absente du tour offert du CALENDRIER et du QUIZ
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

  **⚠️ TROIS FORMULAIRES RESTENT EXPOSÉS**, même classe de défaut, même impact
  commerçant — ils appellent `revalidatePath` puis renvoient un état lu par
  `useActionState` : **clôture de pronostics**, **encaissement en caisse**,
  **clôture de saison de progression**. Ce sont précisément les specs E2E qui
  tombaient. Le correctif est mécanique (même patron que
  `newsletter-composer.tsx`) mais **chacun doit être mesuré avec le harnais**
  avant d'être déclaré réglé — c'est ce qui a manqué toute la journée du
  2026-07-28, où deux hypothèses plausibles ont été poussées puis infirmées.

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
