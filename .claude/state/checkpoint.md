# Checkpoint — Lastchance

## Dernier jalon : Parrainage ludique (prod-ready) ✅
**Date** : 2026-07-24
**Contenu** (commits `abf6204` DB, `2ade1ed` + `f63dbf2` backend, `757d0fb`
frontend, `1f048b8` E2E, `6d7bfba` durcissements — **pas encore poussés/déployés**) :
- **Module** addon `addon_referral` (miroir `addon_calendar`, gating
  `hasReferralAccess`), opt-in PAR CAMPAGNE (`referral_programs.enabled`) sur les
  campagnes ROUE : un joueur satisfait devient PARRAIN (code partageable `PR-…` →
  lien `/play/[slug]?ref=PR-…`, aucune nouvelle surface publique) ; chaque filleul
  qui vient JOUER un spin fait progresser une jauge d'« équipe » PARTAGÉE. V1
  mono-organisation.
- **DB** (migration `20260729120000_referral.sql`) : colonne `addon_referral` ;
  `spins.source` étendu à `'referral'` ; 4 tables org-scopées `referral_programs` /
  `referral_sponsors` / `referral_signups` / `referral_rewards` (FK composites
  tenant, RLS `is_org_member`/`is_org_editor`, aucun accès anon). 7 fonctions
  SECURITY DEFINER : 6 RPC service-role (`ensure_referral_sponsor`,
  `referral_public_state`, `validate_referral` [cœur anti-abus],
  `consume_referral_spin_grant`, `redeem_referral_reward`,
  `purge_expired_referral_data`) + 1 helper interne `referral_emit_reward`.
  EXPECTED_MIGRATION bumpé. pgTAP `referral.test.sql`.
- **Backend** : `referral.ts` (mappers purs), `referral-context.ts`,
  `validations/referral.ts`, `actions/referral.ts` (ensureReferralSponsor,
  validateReferral, consumeReferralSpin, getReferralState, saveReferralProgram),
  caisse unifiée `source: 'referral'` (`lookupRedeemCode` route 7 préfixes),
  rate-limit ADR-032 (`referralPlayerAction` failClosed device / `referralPublicIp`
  fail-open observe), cron `purge-data` branché. Fix `getUserAndOrg` (sélectionnait
  tous les addons sauf `addon_referral`).
- **Frontend** : éditeur campagne `referral-program-settings.tsx` (config libre des
  3 versements) + `referral-redeem-button.tsx` (caisse) ; `ReferralPanel` (parrain :
  CTA, partage, jauge/coffre/équipe) et `ReferralSpinExperience` (filleul par
  `?ref=PR-…` → `validateReferral` APRÈS le spin réel) branchés dans
  `play-experience.tsx` ; la page de jeu ISR expose un prop public `referral`
  (libellés/kinds seulement).
- **Preuve = PARTICIPATION réelle** (jamais un clic) : `validate_referral` exige un
  `proof_spin_id` (spin réel du device filleul, non forgeable/non rejouable/unique).
  **3 versements CONFIG LIBRE** `none`/`spin`/`lot` : parrain / filleul / coffre au
  seuil (`chest_threshold`, défaut 3) ; `lot` = `PARRAIN-…` STOCK FINI (ADR-031),
  `spin` = tour offert (`spins.source='referral'`, ADR-029). « Équipe » =
  jauge/coffre PARTAGÉS, sans classement (coopératif).
- **Invariants (8)** : pas de récompense sur un clic ; self (device+email)/boucle
  A→B→A bloqués ; 1 filleul/campagne/device + fenêtre + plafond ; stock fini
  obligatoire + coffre une fois sous verrou ; multi-tenant (RLS + FK composites,
  `saveReferralProgram` n'écrit jamais les `*_claimed_count`) ; non-fuite
  (`referral_public_state` = parrain courant seul, prop `referral` = libellés/kinds) ;
  rate-limit ADR-032 (failClosed clé device seule) ; jetons (`spin_grant_token`
  192 bits anti-rejeu, codes CSPRNG, purge neutralise les emails). Durcissements
  `6d7bfba` : no-oracle (`rejected` unique) + défense en profondeur
  (`referral_public_state` re-gate addon/enabled/active).
- **Revue sécurité** : verdict GO, 0 finding bloquant ; anti-abus borné par
  l'ÉCONOMIE (stock fini, ADR-031) plus que par les rate limits (ADR-032). QA verte.
- **CI** : `referral.test.sql` (pgTAP) + `e2e/referral.spec.ts` (éditeur, parrain+
  lien, filleul post-spin, caisse double-retrait, axe) + seed `PARRAIN-E2ECHEST`.
  Vérifs CI-only (Docker absent local).
- Migration `20260729120000`, ADR-036.
- **Points ouverts (résidus FAIBLE assumés, docs/bugs.md)** : dédup email inerte
  dans le flux post-spin (validation avant collecte d'email) ; amplification ~3× en
  config spin+spin (bornée par stock fini des lots de la roue) ; entropie
  `referral_code` 40 bits (identifiant partageable non secret). **Suites ouvertes** :
  câblage best-effort de l'email au claim, multi-commerces, parrainage sur d'autres
  mécaniques.

## Jalon précédent : Calendrier de l'Avent & campagnes quotidiennes (prod-ready) ✅
**Date** : 2026-07-23
**Contenu** (commits `6b5e2aa` DB, `7a13a25` backend, `df63433` frontend,
`d420fdd` E2E, `5c4d89f` fix anti-spoiler — **pas encore déployés**) :
- **Module** addon `addon_calendar` (miroir `addon_events`, gating
  `hasCalendarAccess`) : campagne QUOTIDIENNE à mécanique ANNUELLE — le joueur
  revient chaque jour ouvrir UNE case (Avent, semaine anniversaire, compte à
  rebours, 7 jours de cadeaux, festival, lancement produit, semaine soldes), ou
  suit à distance via un rappel email opt-in. V1 mono-organisation.
- **DB** (migration `20260728120000_calendar_campaigns.sql`) : colonne
  `addon_calendar` ; 5 tables `calendars` / `calendar_days` / `calendar_openings`
  / `calendar_rewards` / `calendar_players` (FK composites tenant, RLS org-scopée
  `is_org_member`/`is_org_editor`, aucun accès anon) ; `spins.source` étendu à
  `'calendar'`. RPC service-role : `join_calendar`, `open_calendar_box`,
  `consume_calendar_spin_grant`, `calendar_public_state`,
  `calendar_reminder_targets`, `redeem_calendar_reward`,
  `purge_expired_calendar_players` (+ trigger `calendars_set_defaults` dérivant
  les `unlock_at`). EXPECTED_MIGRATION bumpé. pgTAP `calendar.test.sql`.
- **Backend** : `calendar.ts` (mappers purs + `calendarDayUnlockAt` DST-robuste
  via `Intl`), `calendar-context.ts`, `actions/calendar.ts` (join/open/
  consumeSpin/getState + CRUD dashboard), `calendar-reminders.ts` (cron rappel +
  archivage), `calendar-spin-bundle.ts` (`loadCalendarSpinBundles`),
  `resend.ts` (email rappel), caisse unifiée `source: 'calendar'`
  (`lookupRedeemCode` route 6 préfixes), cron `vercel.json`
  `/api/cron/calendar-reminders` (`15 9 * * *`).
- **Frontend** : `/calendar/[slug]` (page suivable, grille de cases) + manifest
  PWA, dashboard `src/app/dashboard/calendar/*`, `calendar-theme.ts` (5 thèmes
  carton neutre/noël/anniversaire/soldes/festival), `calendar-tracker.tsx`.
- **4 types de case** `content` / `lot` (`CADEAU-…` stock fini) / `spin` (tour
  de roue offert, ADR-029) + récompense d'assiduité finale ; stock fini
  OBLIGATOIRE (ADR-031).
- **Invariants (2 neufs)** : gating temporel SERVEUR-AUTORITATIF
  (`open_calendar_box` : `now()` base vs `unlock_at` dérivé serveur, ouvrir en
  avance impossible) ; non-fuite du contenu d'une case non ouverte (quadruple
  défense : `calendar_public_state` sans contenu + mapper null + `too_early` muet
  + RLS). Rate-limit ADR-032 strict (clé partagée jamais failClosed).
- **Revue finale** : prêt pour la prod, 0 finding bloquant. FAIBLE anti-spoiler
  corrigé (`5c4d89f`) : le préchargement révélait dans le payload RSC les lots
  des roues de cases `spin` de jours VERROUILLÉS (invariant strict NON cassé,
  spoiler réel) → préchargement limité aux cases DÉJÀ ouvertes + bundle renvoyé
  par `openCalendarBox`.
- **CI** : `calendar.test.sql` (pgTAP) + `e2e/calendar.spec.ts` (grille + axe).
  775 tests. Vérifs CI-only (Docker absent local) : pgTAP, E2E, seed.
- Migration `20260728120000`, ADR-035.
- **Points ouverts (résidus assumés, docs/bugs.md)** : UUID `dayIds` futurs
  exposés mais neutralisés par `too_early` muet ; purge RGPD conditionnée à
  l'archivage (opt-in commerçant, borné par `data_retention_months`).
  **Suites ouvertes** : multi-commerces sur un même calendrier, calendriers
  hebdo/mensuels.

## Jalon précédent : Mode événement en direct (prod-ready) ✅
**Date** : 2026-07-23
**Contenu** (commits `ad80a59` DB, `22796c0` backend, `f749fe6` frontend,
`e39a40c` E2E + fix pseudo) :
- **Module** addon `addon_events` : animation LIVE synchronisée à 3 interfaces —
  écran public `/event/[code]/screen`, téléphone joueur `/event/[code]`
  (pseudo+avatar), télécommande orga `/dashboard/events/[id]/remote`.
- **Moteur question générique** quiz/sondage/prono ; séparation CONTENU
  (`event_games`/`questions`/`options`) et RUN (`event_sessions`/`players`/
  `answers`/`wins`) ; machine à états SERVEUR (phase `lobby→…→ended`, transitions
  RPC `is_org_editor`).
- **Invariants** : non-fuite de la bonne réponse (4 défenses, `is_correct` hors
  `event_public_state` avant reveal) ; scoring SERVEUR-autoritatif (`elapsed_ms`
  serveur, verrou homogène). **Transport** : polling primaire sur
  `event_public_state` + Realtime ping-only activable (`EVENTS_REALTIME_ENABLED`)
  — 1re brique temps réel. Podium + lot `EVENT-` stock fini (ADR-031) ; ADR-032
  strict sur join/submit (Wi-Fi bar).
- **Revue sécurité** : déployable SANS bloquant. FAIBLE pseudo Cc/Cf corrigé.
  MOYEN sybil podium (borné stock fini) + INFO = tradeoffs V1 assumés (bugs.md).
- Migration `20260727120000`, ADR-034. 713 tests, CI verte.
- **Points ouverts** : suites V2 (blind test/bingo/roue géante/team battle,
  tirage parmi participants, Turnstile anti-sybil, activation Realtime prod).

## Jalon précédent : Jackpot collectif (prod-ready) ✅
**Date** : 2026-07-23
**Contenu** (commits `13eb81c` DB, `fbb2c3c` backend, `03bc7bd` frontend,
`1292b16` E2E, `45f704c` + `624224f` fixes sécurité) :
- **DB** (migration `20260726120000_jackpot_collective.sql`) : addon
  `addon_jackpot` (miroir `addon_loyalty`) ; 4 tables jackpot_campaigns /
  _players / _participants / _wins (FK composites tenant, RLS complète, aucun
  accès anon, écritures joueur via RPC service-role). Jauge PARTAGÉE
  `current_count` (+1/participation). RPC `record_jackpot_participation` (tout
  atomique sous verrou de campagne : mode, cooldown, +1 jauge, tirage),
  `run_jackpot_date_draws` (pg_cron), `current_jackpot_code` (TOTP comptoir),
  `redeem_jackpot_prize` (caisse, miroir redeem_loyalty_reward),
  `purge_expired_jackpot_players` (RGPD, conserve les hashes de tirage).
- **Backend** : `jackpot-context.ts` (page suivable, résolution id|slug, lecture
  seule), `jackpot-checkin.ts` (jeton de check-in HMAC, domaine
  `jackpot-checkin:`), `jackpot.ts` (`mapJackpotParticipation`),
  `actions/jackpot.ts`, cron `/api/cron/jackpot-draws`, caisse unifiée
  `source: 'jackpot'`.
- **Frontend** : `/jackpot/[id]` (page suivable PWA, jauge temps réel, montant
  cosmétique croissant, bloc commerçant), `manifest.webmanifest` par campagne,
  écran comptoir `/dashboard/jackpot/[id]/comptoir`, dashboard
  `/dashboard/jackpot` + `[id]`, éditeur, bouton caisse, back-office addon.
- **Anti-triche** réutilisé du Passeport (ADR-030) : `validation_mode`
  `rotating_code`/`staff`, cooldown par joueur ≥ 300 s. Économie ADR-031 :
  `reward_stock` FINI et OBLIGATOIRE, `unique(campaign_id, cycle)` → 1 gagnant
  par cycle. **3 modes de tirage** : `threshold_draw` / `rescan_win` /
  `date_draw`. Tirage atomique + vérifiable (`draw_seed`, `gen_random_bytes`).
- **Fixes sécurité (2 bloquants)** : CRITIQUE-1 — code du gagnant fuité au
  déclencheur du seuil en `threshold_draw` → réservé au gagnant, 2 couches
  (`case when v_is_winner` SQL + `code: isWinner ? … : null` app) ; ÉLEVÉ-1 —
  `date_draw` re-tirait à chaque cron → clôture ONE-SHOT (cycle figé), campagne
  laissée `active` pour la récupération asynchrone du code.
- **CI** : `jackpot.test.sql` (pgTAP, sections 12-13 pour les 2 régressions) +
  `e2e/jackpot.spec.ts` (page suivable : affichage + axe + 404) ;
  `security_acl.test.sql` étendu ; EXPECTED_MIGRATION bumpé.
**ADR** : 033 (jauge partagée, tirage atomique/équitable/vérifiable, 3 modes,
réutilisation anti-triche + verrous économiques, date_draw one-shot, RGPD hashes
de tirage conservés).
**Verdict sécurité** : prêt pour la prod, 2 bloquants corrigés et vérifiés.
**Points ouverts (limites V1 assumées, docs/bugs.md)** : scans post-`date_draw`
incrémentent la jauge cosmétique sans gain ; stock résiduel d'un `date_draw`
non distribué. **Suites ouvertes** : multi-commerces sur une même jauge
(multi-tenant croisé) ; état « tirage effectué » sur la page publique ; stopper
les participations après `draw_at`.

## Jalon précédent : Passeport de fidélité ludique (GA, production) ✅
**Date** : 2026-07-22 → 2026-07-23 (GA)
**Contenu** (commits `5a4e1de`→`5ba06a1`, 8 revues sécurité) :
- **DB** (migrations `20260725120000`→`20260725200000`) : addon `addon_loyalty` ;
  tables loyalty_programs / _milestones / _members / _stamps / _rewards
  (FK composites tenant, RLS is_org_member/editor, secret du code tournant
  service-role-only) ; RPC `record_loyalty_stamp` (tampon atomique sous verrou :
  mode, cooldown, niveau, paliers → lot `FIDELITE-…` ou grant de spin),
  `current_loyalty_code` (code TOTP comptoir), `consume_loyalty_spin_grant`
  (grant → tirage atomique sur roue cible, `source='loyalty'`),
  `redeem_loyalty_reward` (remise caisse), `purge_expired_loyalty_members`
  (RGPD, borne sur la dernière activité).
- **Backend** : `loyalty-context.ts`, `loyalty-checkin.ts` (jeton de check-in
  HMAC TTL 3 min), `actions/loyalty.ts`, caisse unifiée `source: 'loyalty'`.
- **Frontend** : `/passeport/[programId]` (tampons, niveau, paliers, spin
  offert), écran comptoir, éditeur commerçant, dashboard, back-office addon.
- **Durcissement GA** (8 revues, chaque fix révélant le défaut sous le
  précédent) : QR staff bearer 180 j → jeton de check-in signé TTL 3 min ;
  rejeu → planchers de cooldown durcis (staff 300 s, rotating
  `max(2 × période, 300 s)`) ; seaux kill-switch → 3 DoS avant fermeture par
  clé d'identité + retrait ; frappe de masse → verrous économiques (stock fini
  obligatoire + palier ≥ 2) ; palier spin non borné → stock fini aussi sur spin
  + exclusion du lot illimité + vérif de campagne ; `select("*")` éditeur
  (aurait 404) ; action Turnstile récupération pronos ; contraste a11y
  paliers/tampons.
- **CI** : `loyalty.test.sql` (pgTAP) + `e2e/loyalty.spec.ts` ;
  `security_acl.test.sql` étendu ; garde-fou CI « tout pgTAP exécuté » (`383c675`).
**ADR** : 028 (addon + récompense mixte), 029 (spin offert = grant à usage
unique), 030 (2 modes, limites fermées avant GA), 031 (bornes économiques :
stock fini + palier ≥ 2), 032 (règle rate-limit : aucun failClosed sur clé
partagée en parcours public).
**Verdict sécurité** : GA, 0 finding bloquant ; perte maximale bornée ≈ 150 €.
**Points ouverts** :
- Dette rate-limit PRÉEXISTANTE hors module (`hunt:scan:ip`, `hunt:claim:ip`,
  `prono:*`, `spin:ip` — seaux failClosed sur clé partagée, disponibilité
  seule) : **en cours dans un chantier séparé** (autre agent), non résolue ici
  (ADR-032, docs/bugs.md).
- Résiduels FAIBLE : grants de spin injouables dont `reward_claimed_count`
  n'est pas restitué (sous-distribution, pas de faille) ; UX du transfert de
  coût d'un tour offert gagnant vers la campagne ciblée.

## Jalon précédent : Chasse au trésor multi-QR ✅
**Date** : 2026-07-22
**Contenu** (8 commits `f5525df`→`88db5bc`) :
- **DB** (`20260724120000_treasure_hunts.sql`) : addon `addon_hunts` ;
  tables hunts / hunt_steps / hunt_players / hunt_scans / hunt_completions
  (FK composites tenant, RLS is_org_member/editor, audit) ; RPC
  `record_hunt_scan` (scan atomique sous verrou : tampon idempotent, ordre,
  délai, complétion + code `CHASSE-…` + stock), `redeem_hunt_completion`
  (remise caisse), `purge_expired_hunt_players` (RGPD).
- **Backend** : `hunt-context.ts` (contexte public étape→chasse→joueur,
  gardes inter-tenant, `hasHuntsAccess`), `actions/hunts.ts` (CRUD éditeur,
  `stampHuntStep` au POST anti-prefetch, `claimHuntReward` email optionnel à
  usage unique), caisse unifiée `lookupRedeemCode` → `CashierMatch` par
  `source`, `redeemHuntCompletion`.
- **Frontend** : `/hunt/[token]` (carnet de tampons, indices, complétion +
  rappel email), éditeur commerçant (`hunt-editor`, réordonnancement,
  affiches QR par étape), bouton caisse chasse, back-office addon.
- **Sécurité** : revue passée — 1 ÉLEVÉ corrigé (claim email à usage unique,
  `88db5bc`), 1 MOYEN corrigé (rate-limit scan IP partagée) ; 4 INFO
  consignés FAIBLE (docs/bugs.md).
- **Fix routage caisse** (`e1dea3a` saisie, `46d8868` scanner) :
  `normalizeRedeemCode` préfixait de force en `GAIN-` → branche chasse morte.
- **CI** : `hunts.test.sql` (pgTAP) + `automation.test.sql` rebranché
  (`842d7e3`) + `e2e/hunt.spec.ts` (`06937f5`).
**ADR** : 023 (addon + lot direct), 024 (claim email usage unique),
025 (rate-limit scan IP partagée), 026 (pas de géoloc / délai minimal),
027 (V1 mono-organisation).
**Vérifié** : typecheck, lint, 385 tests, build — vert localement.
**Reste pour la CI** : pgTAP et E2E Playwright (Docker absent localement).
**Points ouverts** : 4 INFO FAIBLE (token CHECK 8 vs 16, webhook newsletter
non émis au claim chasse, contention verrou scan, réordonnancement chasse
pleine) ; suites produit (multi-commerçants partenaires, mini-jeux d'étape,
récompenses intermédiaires, défaut délai > 0).

## Jalon précédent : Accessibilité volet 2 ✅
**Date** : 2026-07-21 (commits `ce2eb78`, `bc9615c`, `028717d`)
- **Contraste auto des labels de roue** : `src/lib/contrast.ts`
  (luminance/ratio WCAG), `labelColor: "auto"` — défaut des styles
  vierges uniquement, hex existants intacts — calcul par segment dans
  `wheel-svg.tsx`, case « Contraste auto » + avertissement < 3:1 dans
  le Studio.
- **Lien d'évitement** : `src/components/ui/skip-link.tsx`, posé sur
  landing, dashboard, `/play/[slug]` et `/pronos/[slug]`
  (`<main id="contenu" tabIndex={-1}>`).
- **axe-core dans Playwright** : `@axe-core/playwright`, helper
  `e2e/axe.ts` (échec serious/critical, moderate/minor loggées, zéro
  règle exclue) ; scans intégrés aux specs player-win, pronostics,
  roles + spec dédiée `e2e/a11y.spec.ts` pour la landing.
- **Vraies violations corrigées au passage** (`bc9615c`) : 3 contrastes
  `bg-k-green` sur la landing (texte passé à 4.59:1) + `aria-label` sur
  l'input code du poste caisse.
**Vérifié** : 338 tests, build OK (local).
**Point ouvert** : premier run CI des scans axe à surveiller (E2E non
exécutés localement, Docker absent). Le bloc accessibilité de l'audit
est désormais entièrement traité (docs/roadmap.md).

## Jalon précédent : Quick wins maintenabilité & accessibilité ✅
**Date** : 2026-07-21 (commits `a5fc2cb`, `b7db502`)
- **Types Supabase générés** : snapshot `src/types/database.generated.ts`
  commité (`npm run types:generate`, source `--linked`) + garde CI
  anti-dérive dans le job `database-security` (régénération `--local` +
  `git diff --exit-code -I 'PostgrestVersion'`).
  **Nouveau réflexe dev : migration → `npm run types:generate` → commit,
  sinon CI rouge.** `database.ts` manuel conservé (en-tête ajouté),
  migration progressive vers les types générés (roadmap).
- **A11y roue** : `prefers-reduced-motion` → spin 4400→300 ms, 1 tour,
  easing linéaire, hook matchMedia sans mismatch d'hydratation
  (`play-experience.tsx`, prop `reducedMotion` de `wheel-svg.tsx`).
  Carte à gratter vérifiée non concernée.
- **A11y onglets Player Hub** : WAI-ARIA Tabs complet (roving tabIndex,
  ArrowLeft/Right avec wrap, Home/End, focus suit la sélection) ; helper
  pur `src/components/pronos/tab-nav.ts` + 8 tests.
**Vérifié** : qa-verify vert — 324 tests, build OK.
**Suite** : règles de « refactoring opportuniste » consignées dans
docs/roadmap.md (découpage des gros fichiers au fil de l'eau, avatars
lazy, axe-core en E2E, items reportés en arbitrage produit).

## Jalon précédent : V1.6 — Pronostics avancé + Automatisations commerçant ✅
**Date** : 2026-07-21
**Contenu** (5 commits `69f158f`→`bc3f60b` + fix sécurité en cours de commit) :
- **DB** (`20260723100000` + `20260723110000`) : ligues privées
  (contest_leagues/members, RPC create/join/leave, leaderboard/rank avec
  `p_league_id` re-numéroté 1..n) ; budget/programmation de campagne
  (imputation atomique dans claim_winning_spin, pause auto,
  run_campaign_schedule en pg_cron SQL direct */10 min) ; alerte stock
  (trigger réarmé au restock) ; automation_settings + email_log
  (dedup_key unique) ; newsletter_subscribers.birth_date ; 4 RPC de
  ciblage service-role ; pgTAP automation.test.sql ;
  EXPECTED_MIGRATION=20260723110000.
- **Backend pronos** : addContestMatches (lot 1..30 tout-ou-rien),
  route publique /api/pronos/[slug]/tv (top 30 sans PII, s-maxage=30,
  fail-open), actions ligues (rate limits dédiés fail-closed).
- **Backend automatisations** : jobs automation.budget-paused/low-stock/
  run-scenarios, cron /api/cron/automations 09:30 (idempotent par
  org+jour), src/lib/automations.ts, 6 emails Resend (transactionnel vs
  marketing List-Unsubscribe), claimPrize avec double consentement
  anniversaire (13..120 ans).
- **UI** : saisie rapide + progression + page TV + onglet Ligues ;
  page /dashboard/settings/automations, carte Programmation et budget,
  bannières budget_reached/schedule_end, seuil stock, case 🎂 dans le
  claim-form.
- **Sécurité** : revue non bloquante, 0 critique/élevé ; MOYEN corrigé
  (garde owner/editor sur updateCampaignAutomation et
  resumeCampaignAfterBudget) ; 2 FAIBLE assumés → docs/bugs.md.
**ADR** : 018 (budget au claim), 019 (anniversaire double consentement),
020 (rangs de ligue), 021 (reengage/inactive), 022 (TV fail-open).
**Vérifié** : typecheck 0 erreur, lint 0 warning, Vitest 316/316, build OK.
**Reste pour la CI** : pgTAP (supabase test db) et 73 E2E Playwright
(Docker absent localement ; --list OK). Chevauchement reengage/inactive :
arbitrage produit ouvert (ADR-021).

## Jalon précédent : V1.2 — réglages de jeu par campagne ✅
**Date** : 2026-07-07 (nuit)
**Contenu** :
- Les actions d'engagement se configurent désormais **par campagne**
  (page campagne, carte « Actions avant de jouer ») — plus dans Réglages.
- Nouvelle carte « Après le gain » par campagne : demander email et/ou
  téléphone avant d'afficher le code (ou rien → code direct, participation
  anonyme), compte à rebours optionnel (10-600 s) avant masquage du code.
- `claimPrize` revalide les exigences côté serveur ; participation avec
  email/prénom nullable + colonne phone ; email de gain envoyé seulement
  si email collecté ; export CSV avec téléphone.
**Migration à appliquer en prod** : `00004_campaign_play_settings.sql`
(après la 00003 ; recopie la config org existante sur les campagnes puis
supprime organizations.engagement).
**Vérifié** : build ✓, lint ✓, 26 tests ✓.

## Jalon précédent : V1.1 — retours du premier déploiement ✅
**Date** : 2026-07-07 (soir)
**Contenu** : app déployée en prod par l'utilisateur (Supabase + Stripe +
Vercel opérationnels, « tout fonctionne »). Trois évolutions livrées suite
aux premiers tests réels :
1. **Email de gain fiabilisé** — logs détaillés `[resend]` (variable
   manquante, id d'envoi, erreur exacte) + guide de dépannage README.
   Cause la plus probable côté prod : env vars Resend absentes de Vercel
   ou domaine non vérifié (mode test = envoi uniquement au propriétaire).
2. **Actions d'engagement pré-spin** — newsletter / Instagram / TikTok /
   avis Google, configurables par le commerçant (Réglages), gate côté
   joueur, revalidation serveur, table `newsletter_subscribers` + export
   CSV, traçabilité `spins.engagement_action`.
3. **Essai 7 jours** (au lieu de 14) — `organizations.trial_ends_at`,
   gating : essai expiré = QR codes toujours créables mais campagnes non
   activables et roues publiques désactivées. Bannières dashboard
   (jours restants / essai terminé). Checkout Stripe : reprend les jours
   d'essai restants (pas de réarmement).
**Migration à appliquer en prod** : `00003_engagement_and_trial.sql`.
**Vérifié** : build ✓, lint ✓, 26 tests unitaires ✓.

## Jalon précédent : V1 MVP complète ✅
**Date** : 2026-07-07
**Contenu** : les 11 étapes du plan V1 sont livrées, vérifiées
(build/lint/15 tests unitaires/tests SQL RLS) et poussées sur
`claude/project-template-init-gvkmn5`.

### Critères de succès du /goal
- [x] Architecture propre (plan validé puis implémenté)
- [x] Base de données bien conçue (8 tables, RLS, fonctions atomiques)
- [x] Authentification sécurisée (Supabase SSR + proxy)
- [x] Système multi-tenant (organization_id partout + RLS testée)
- [x] Dashboard administrateur (5 sections)
- [x] Roue entièrement configurable (lots, poids, stocks, couleurs)
- [x] Parcours utilisateur complet (scan → roue → formulaire → gain)
- [x] Génération de QR Code (PNG téléchargeable + compteur)
- [x] Stripe fonctionnel (checkout, webhook, sync, gating)
- [x] Déployable sur Vercel (guide README ; nécessite les clés services)

## Prochain jalon suggéré : Pilote réel
1. Provisionner Supabase/Stripe/Resend (15 min, guide README)
2. Déployer sur Vercel
3. Tester le parcours complet en conditions réelles
4. Premier commerce pilote → alimenter la roadmap V1.1

## Historique
- 2026-07-06 : Initialisation projet (docs + mémoire)
- 2026-07-06→07 : Développement V1 complet (11 étapes, 1 commit/étape)
