# Project State — Lastchance

## Statut
**Phase** : bêta privée — V1 + Studio créatif + Pronostics enrichi
(ligues, TV, saisie rapide) + Automatisations commerçant (V1.6) +
Chasse au trésor multi-QR (V1.7) + Passeport de fidélité (V1.8, GA prod) +
Jackpot collectif (V1.9, prod) + Mode événement en direct (V1.10, prêt pour la prod) +
Calendrier de l'Avent & campagnes quotidiennes (V1.11, prêt pour la prod) +
Parrainage ludique (V1.12, prêt pour la prod)
**Dernière mise à jour** : 2026-07-24
**Branche** : main (production Vercel, plan Hobby)

## Dernier chantier : Parrainage ludique (2026-07-24, prod-ready)
Nouveau module addon (`addon_referral`, miroir Calendrier, gating `hasReferralAccess`),
opt-in PAR CAMPAGNE (`referral_programs.enabled`) sur les campagnes ROUE : un joueur
satisfait devient PARRAIN (code partageable `PR-…` → lien `/play/[slug]?ref=PR-…`,
aucune nouvelle surface publique) ; chaque filleul qui vient JOUER un spin fait
progresser une jauge d'« équipe » PARTAGÉE et débloque des récompenses. **Preuve =
PARTICIPATION réelle, jamais un clic** : `validate_referral` (cœur anti-abus) exige un
`proof_spin_id` (spin réel du device filleul, non forgeable/non rejouable/unique),
appelé APRÈS le spin réel. **3 versements en CONFIG LIBRE** commerçant, chacun
`none`/`spin`/`lot` : parrain (par filleul validé) / filleul (bienvenue) / coffre
collectif au seuil (`chest_threshold`, défaut 3) ; `lot` = code `PARRAIN-…` STOCK FINI
(ADR-031), `spin` = tour offert (`consume_referral_spin_grant` → tirage
`spins.source='referral'` → flux de gain `GAIN-…`, ADR-029). « Équipe » = jauge
(`validated_count`) + coffre PARTAGÉS, débloqués une seule fois au seuil sous verrou,
PAS de classement (coopératif). **Anti-abus 100 % serveur borné par l'économie** :
self (device+email) et boucle directe A→B→A bloqués, 1 filleul/campagne/device, fenêtre
`window_days` + plafond `sponsor_max_filleuls` (cycles ≥3 non détectés mais bornés par
plafond+fenêtre+coût de N spins réels). Durcissements (`6d7bfba`) : no-oracle
(`rejected` unique côté action) + défense en profondeur (`referral_public_state`
re-gate addon/enabled/active). Rate-limit ADR-032 : failClosed clé device
(`referralPlayerAction`), IP fail-open observe (`referralPublicIp`). Caisse unifiée
`source: 'referral'` (7e préfixe `PARRAIN-`, `redeem_referral_reward` org-scopée/
auditée). Purge RGPD `purge_expired_referral_data` (neutralise les emails opt-in).
Identité device par `anonymousPlayerKey` (hash, aucune PII). V1 mono-organisation.
Fichiers clés : migration `20260729120000_referral.sql`, `src/lib/referral.ts`
(mappers), `src/lib/referral-context.ts`, `src/lib/validations/referral.ts`,
`src/actions/referral.ts` (ensureReferralSponsor, validateReferral, consumeReferralSpin,
getReferralState, saveReferralProgram), caisse `src/actions/participations.ts`,
`src/components/dashboard/referral-program-settings.tsx` (éditeur config libre) +
`referral-redeem-button.tsx`, `src/components/wheel/referral-panel.tsx` +
`referral-spin-experience.tsx` (branchés dans `play-experience.tsx`). Fix
`getUserAndOrg` (sélectionnait tous les addons sauf `addon_referral`).
EXPECTED_MIGRATION bumpé à `20260729120000`. **Revue sécurité GO SANS bloquant, QA
verte.** Commits `abf6204` (DB), `2ade1ed` + `f63dbf2` (backend), `757d0fb`
(frontend), `1f048b8` (E2E), `6d7bfba` (durcissements). **NON encore poussé/déployé.**
ADR-036. **Points ouverts : 3 résidus FAIBLE assumés (dédup email inerte post-spin ;
amplification ~3× en config spin+spin bornée par stock fini ; entropie code 40 bits) ;
suites produit (câblage email au claim, multi-commerces, parrainage sur autres
mécaniques).** Vérifs CI-only (Docker absent) : pgTAP `referral.test.sql`, E2E
`e2e/referral.spec.ts`, seed `PARRAIN-E2ECHEST`.

## Chantier précédent : Calendrier de l'Avent & campagnes quotidiennes (2026-07-23, prod-ready)
Nouveau module addon (`addon_calendar`, miroir Événement) : campagne QUOTIDIENNE à
mécanique ANNUELLE — le joueur revient chaque jour ouvrir UNE case (Avent, semaine
anniversaire, compte à rebours, 7 jours de cadeaux, festival, lancement produit,
semaine soldes), ou suit à distance via un rappel email opt-in. Page publique
suivable `/calendar/[slug]` installable (PWA, manifest par calendrier), 5 thèmes
carton (neutre/noël/anniversaire/soldes/festival). 4 types de case
(`calendar_days.kind`) `content` / `lot` (code `CADEAU-…` à stock fini) / `spin`
(tour de roue offert, grant à usage unique → `consume_calendar_spin_grant` →
tirage `source='calendar'` → flux de gain `GAIN-…`, ADR-029) + récompense
d'assiduité finale (toutes cases ouvertes → `CADEAU-…`). Stock fini OBLIGATOIRE
(ADR-031). **2 invariants neufs** confirmés par revue adversariale : gating
temporel SERVEUR-AUTORITATIF (`open_calendar_box` tranche `now()` base vs
`unlock_at` dérivé serveur — minuit civil du fuseau, DST-robuste via `Intl`,
`calendarDayUnlockAt` — ouvrir en avance impossible) ; non-fuite du contenu d'une
case non ouverte (quadruple défense : `calendar_public_state` sans contenu +
mapper null + `too_early` muet + RLS/grants). Caisse unifiée `source: 'calendar'`
(6 préfixes, `redeem_calendar_reward` couvrant case-lot ET assiduité), cron
`/api/cron/calendar-reminders` (`15 9 * * *`) + archivage, purge RGPD
`purge_expired_calendar_players`. Transport polling. Identité joueur par cookie
HTTP-only + hash (aucune PII). V1 mono-organisation. Fichiers clés : migration
`20260728120000`, `src/lib/calendar.ts` (+ `calendarDayUnlockAt`),
`src/lib/calendar-context.ts`, `src/lib/calendar-reminders.ts`,
`src/lib/calendar-spin-bundle.ts`, `src/actions/calendar.ts`, `/calendar/[slug]`
(+ manifest), `src/app/dashboard/calendar/*`,
`src/components/calendar/*` (dont `calendar-theme.ts`, `calendar-tracker.tsx`).
**Revue finale passée SANS bloquant** ; FAIBLE anti-spoiler corrigé (`5c4d89f`) :
le préchargement révélait dans le payload RSC les lots des roues de cases `spin`
de jours VERROUILLÉS (invariant strict de non-fuite NON cassé, mais spoiler réel)
→ préchargement limité aux cases DÉJÀ ouvertes + bundle renvoyé par
`openCalendarBox`. Commits `6b5e2aa` (DB), `7a13a25` (backend), `df63433`
(frontend), `d420fdd` (E2E), `5c4d89f` (fix). **Pas encore déployés.** ADR-035.
775 tests. **Points ouverts : résidus assumés (UUID `dayIds` futurs exposés mais
neutralisés par `too_early` muet ; purge RGPD conditionnée à l'archivage opt-in
commerçant) ; suites produit (multi-commerces, calendriers hebdo/mensuels).**

## Chantier antérieur : Mode événement en direct (2026-07-23, prod-ready)
Module addon `addon_events` : animation LIVE synchronisée à 3 interfaces (écran
public `/event/[code]/screen`, téléphone joueur `/event/[code]` pseudo+avatar,
télécommande orga `/dashboard/events/[id]/remote`). Moteur « question » générique
quiz/sondage/prono ; séparation CONTENU (`event_games`/`questions`/`options`) et
RUN (`event_sessions`/`players`/`answers`/`wins`) ; machine à états serveur
`lobby→…→ended`. Invariants : non-fuite de la bonne réponse (4 défenses),
scoring serveur-autoritatif. Transport polling primaire + Realtime ping-only
activable (1re brique temps réel). Podium + lot `EVENT-` stock fini. Migration
`20260727120000`, ADR-034 (détail : checkpoint.md). Revue passée sans bloquant.

## Chantier plus ancien : Jackpot collectif (2026-07-23, prod-ready)
Nouveau module addon (`addon_jackpot`, miroir Passeport) : une CAGNOTTE
COLLECTIVE à jauge PARTAGÉE — chaque participation validée = +1 sur un compteur
global (`current_count`) affiché en temps réel. Anti-triche réutilisé du
Passeport (`validation_mode` code tournant TOTP / staff via jeton de check-in
signé domaine `jackpot-checkin:`, cooldown par joueur ≥ 300 s). 3 modes de
tirage (`draw_mode`) : `threshold_draw` (auto au seuil parmi tous les
participants du cycle), `rescan_win` (jauge pleine = armé, chance instantanée par
scan), `date_draw` (cron `jackpot-draws`). Tirage ATOMIQUE (verrou +
`unique(campaign_id, cycle)`) et VÉRIFIABLE (`draw_seed` journalisé,
`gen_random_bytes`). Récompense = lot unique `JACKPOT-…` en caisse
(`redeem_jackpot_prize`), STOCK FINI OBLIGATOIRE (ADR-031). Page publique
suivable `/jackpot/[id]` installable (PWA, manifest par campagne) + écran
comptoir temps réel + caisse unifiée (`source: 'jackpot'`). Identité joueur par
cookie HTTP-only + hash (aucune PII) ; purge RGPD conserve les hashes anonymes
des tirages. V1 mono-organisation. Fichiers clés : migration `20260726120000`,
`src/lib/jackpot-context.ts`, `src/lib/jackpot-checkin.ts`, `src/lib/jackpot.ts`,
`src/actions/jackpot.ts`, `/jackpot/[id]`, `src/components/jackpot/*`,
`/api/cron/jackpot-draws`. **Revue sécurité passée, 2 bloquants corrigés et
vérifiés** : CRITIQUE-1 (code du gagnant fuité au déclencheur du seuil → réservé
au gagnant, 2 couches SQL + app) ; ÉLEVÉ-1 (`date_draw` re-tirage à chaque cron →
clôture one-shot, cycle figé). Commits `13eb81c` (DB), `fbb2c3c` (backend),
`03bc7bd` (frontend), `1292b16` (E2E), `45f704c` + `624224f` (fixes). ADR-033.
**Points ouverts : limites V1 assumées (scans post-date_draw incrémentant la
jauge cosmétique ; stock résiduel non distribué) ; suites produit (multi-commerces
sur une même jauge, état « tirage effectué » sur la page publique, arrêt des
participations après `draw_at`).**

## Chantier plus ancien encore : Passeport de fidélité ludique (2026-07-22 → 2026-07-23, GA)
Nouveau module addon (`addon_loyalty`, miroir Chasse) livré EN PRODUCTION en
qualité GA. Le client cumule des visites (« tampons ») sur un passeport
dématérialisé ; niveaux bronze/argent/or (seuils configurables) ; paliers à
récompense MIXTE, tous à STOCK FINI OBLIGATOIRE et palier ≥ visite 2 : lot
direct (code `FIDELITE-…` remis en caisse via `redeem_loyalty_reward`) ou tour
de roue offert (grant à usage unique → `consume_loyalty_spin_grant` → tirage
atomique `source='loyalty'` → flux de gain normal `GAIN-…`). Deux modes de
validation au choix du commerçant : code tournant type TOTP sur écran comptoir
(secret jamais exposé) et validation staff en caisse via un jeton de check-in
signé TTL 3 min (fin du bearer 180 j photographiable). Identité joueur par
cookie HTTP-only + hash (aucune PII). `record_loyalty_stamp` atomique sous
verrou du programme. Caisse unifiée roue/chasse/fidélité par `source`. V1
mono-organisation. Fichiers clés : migrations `20260725120000`→`20260725200000`,
`src/lib/loyalty-context.ts`, `src/lib/loyalty-checkin.ts`,
`src/actions/loyalty.ts`, `/passeport/[programId]`, `src/components/loyalty/*`.
**8 revues sécurité** (chaque correctif révélant le défaut sous le précédent) →
verdict GA, 0 finding bloquant, perte maximale bornée ≈ 150 € par les verrous
économiques. Commits `5a4e1de`→`5ba06a1`. ADR-028 à 032. **Points ouverts :
dette rate-limit PRÉEXISTANTE (hunt/prono/spin, seaux failClosed sur clé
partagée — disponibilité seule) en cours dans un chantier séparé (autre agent,
non résolue ici) ; résiduels FAIBLE (grants de spin injouables, UX du transfert
de coût du tour offert) ; suites produit (streak, multiplicateurs/missions,
badges, multi-établissements).**

## Chantier du 2026-07-22 : Chasse au trésor multi-QR
Nouveau module addon (`addon_hunts`, miroir Pronostics) : parcours de 2 à
10 QR codes (étapes), scan → « Valider mon passage » (POST anti-prefetch)
→ tampon + indice → complétion, lot DIRECT avec code de retrait `CHASSE-…`
remis en caisse (RPC `redeem_hunt_completion`). Identité joueur par cookie
HTTP-only + hash (aucune PII). `record_hunt_scan` atomique sous verrou de
chasse (tampon, ordre, délai, complétion + stock). Caisse unifiée
roue/chasse par un champ `source`. Pas de géolocalisation (délai minimal
optionnel seul garde-fou anti-partage). V1 mono-organisation. Fichiers
clés : `20260724120000_treasure_hunts.sql`, `src/lib/hunt-context.ts`,
`src/actions/hunts.ts`, `/hunt/[token]`, `src/components/hunts/*`, caisse
`src/actions/participations.ts`. Sécurité : 1 ÉLEVÉ + 1 MOYEN corrigés
(claim email usage unique, rate-limit scan IP partagée). 385 tests, build
OK (commits `f5525df`→`88db5bc`). ADR-023 à 027. **Points ouverts : 4 INFO
FAIBLE (docs/bugs.md), suites produit (multi-commerçants, mini-jeux,
récompenses intermédiaires, défaut délai > 0).**

## Chantier du 2026-07-21 : accessibilité volet 2
Contraste auto des labels de roue (`src/lib/contrast.ts`,
`labelColor: "auto"` sur les styles vierges uniquement), lien
d'évitement (`skip-link.tsx` sur landing, dashboard, /play, /pronos),
scans axe-core dans Playwright (`e2e/axe.ts`, échec serious/critical,
spec dédiée `e2e/a11y.spec.ts`) ; 3 contrastes landing + `aria-label`
caisse corrigés au passage. 338 tests, build OK (commits `ce2eb78`,
`bc9615c`, `028717d`). **Point ouvert : surveiller le premier run CI
des scans axe (E2E non exécutés localement).**

## Chantier du 2026-07-21 (bis) : quick wins maintenabilité/a11y
Types Supabase générés (`src/types/database.generated.ts` + garde CI
anti-dérive ; **réflexe : migration → `npm run types:generate` → commit,
sinon CI rouge**), roue respectant `prefers-reduced-motion`, onglets
Player Hub au clavier (WAI-ARIA Tabs). 324 tests, build OK (commits
`a5fc2cb`, `b7db502`). Règles de refactoring opportuniste consignées
dans docs/roadmap.md.

## Chantier V1.6 (2026-07-21)
Ligues privées + mode TV + saisie en lot côté Pronostics ; budget de
gains, programmation, alerte stock et 4 scénarios marketing côté
automatisations (détail : .claude/state/checkpoint.md, ADR-018 à 022).
Vérifié : typecheck, lint, Vitest 316/316, build. À couvrir en CI :
pgTAP et 73 E2E Playwright (Docker absent localement).

## Le projet
SaaS multi-tenant de gamification pour commerces : roue de la fortune
par QR code, espace commerçant complet, abonnement Stripe.
Stack : Next.js 16 + TS + Tailwind 4 + Supabase + Stripe + Resend + PostHog.

## Étapes livrées
1. ✅ Scaffold Next.js 16 (build/lint/vitest)
2. ✅ Schéma SQL multi-tenant + RLS (validé sur PG16 local : isolation + stock atomique)
3. ✅ Auth Supabase + middleware/proxy + onboarding org
4. ✅ Dashboard + CRUD campagnes (roue 1:1 auto-créée avec lots par défaut)
5. ✅ Config roue + CRUD lots (poids, stock, couleurs, perdants)
6. ✅ /play/[slug] : spin serveur anti-triche + animation (15 tests unitaires)
7. ✅ Formulaire participation RGPD + claim token + email Resend
8. ✅ QR codes (PNG 512px, téléchargement, scans)
9. ✅ Participations (recherche code, validation remise, export CSV) + stats
10. ✅ Stripe (checkout 14j essai, portail, webhook idempotent, gating)
11. ✅ PostHog + README déploiement + docs à jour

## Vérifications effectuées ici
- `npm run build` ✓ · `npm run lint` ✓ · `npm test` (15 tests) ✓
- Migrations appliquées sur PostgreSQL 16 local avec stubs Supabase
- Tests SQL : isolation RLS inter-org, décrément stock 2→0 puis refus

## Ce qui reste à faire hors code (par l'utilisateur)
La production tourne (Supabase, Stripe, Resend, Vercel configurés ;
migrations auto-appliquées). Restent : les activations Vault des workers
pg_cron (docs/observability.md) et l'arbitrage produit reengage/inactive
(ADR-021).

## Points d'attention pour la suite
- Types Supabase : snapshot généré `database.generated.ts` commité (garde CI
  anti-dérive) ; `src/types/database.ts` manuel migre progressivement vers
  les types générés (refactoring opportuniste, roadmap)
- Le stock est réservé au spin (ADR-007) : un gagnant qui abandonne le
  formulaire consomme une unité
- Postgres local de validation : /tmp/lastchance-pgdata (jetable)
