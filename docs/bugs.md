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

## High Priority
*(None)*

## Medium Priority
*(None)*

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
