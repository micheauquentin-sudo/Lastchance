# Transmission Codex â†’ Claude Code

> Document local de rÃ©fÃ©rence partagÃ©. Claude Code le lit avant toute mission
> demandÃ©e par l'utilisateur et peut y ajouter son avancement rÃ©el selon la
> rÃ¨gle ci-dessous. Codex le met Ã  jour aprÃ¨s chaque audit, dÃ©cision, lot validÃ©
> ou constat d'Ã©cart.

## RÃ¨gle de travail

- Codex pilote le dÃ©veloppement : il conduit les audits, dÃ©finit les prioritÃ©s,
  rÃ©dige les propositions et contrÃ´le les rÃ©sultats. Pour un audit complet, il
  mobilise ses agents Codex pertinents sur produit, architecture, qualitÃ©,
  performance et sÃ©curitÃ© ; pour un audit ciblÃ©, il choisit les agents dont le
  regard apporte une preuve utile.
- Chaque audit distingue les faits vÃ©rifiÃ©s des hypothÃ¨ses et couvre, selon le
  pÃ©rimÃ¨tre, la valeur mÃ©tier, l'expÃ©rience et l'accessibilitÃ©, la fiabilitÃ© et
  la performance, ainsi que la sÃ©curitÃ©, la confidentialitÃ© et le multi-tenant.
- Chaque proposition Codex doit Ãªtre justifiÃ©e par un constat ou une hypothÃ¨se
  vÃ©rifiable, le bÃ©nÃ©fice concret pour le commerÃ§ant ou le joueur, le risque,
  le coÃ»t de mise en Å“uvre, les dÃ©pendances, une mÃ©trique de succÃ¨s et une
  prioritÃ©. Les idÃ©es dÃ©coratives ou non reliÃ©es Ã  une friction, un risque, un
  coÃ»t ou un rÃ©sultat mesurable ne sont pas retenues ; les pistes Ã©cartÃ©es sont
  signalÃ©es avec leur raison.
- AprÃ¨s chaque audit, demande d'amÃ©lioration, dÃ©cision ou proposition, Codex
  met Ã  jour ce document : Ã©tat rÃ©el, Ã©lÃ©ments faits, Ã©lÃ©ments non faits,
  risques et prochaine dÃ©cision. Ce document est le journal partagÃ© unique.
- Codex ne lance plus Claude Code, ne lit plus ses sessions et ne modifie pas
  ses rÃ©glages.
- Claude intervient seulement Ã  la demande directe de l'utilisateur dans VS
  Code. Avant d'agir, il lit ce document, `CLAUDE.md`, les Ã©tats
  `.claude/state/`, puis vÃ©rifie `git status --short`.
- Claude choisit et coordonne lui-mÃªme ses agents selon ses rÃ¨gles existantes.
  Codex ne lui impose ni agent, ni modÃ¨le, ni sÃ©quencement d'exÃ©cution.
- **Autorisation utilisateur (2026-08-06) :** Claude peut mettre Ã  jour ce
  document aprÃ¨s chaque avancÃ©e significative d'un lot (dÃ©but confirmÃ©,
  modification prÃªte Ã  relire, validation, blocage ou clÃ´ture). Il ajoute une
  entrÃ©e datÃ©e dans **Journal d'avancement Claude**, en tÃªte de cette section,
  sans supprimer, rÃ©Ã©crire ni dÃ©placer une dÃ©cision Codex, un pÃ©rimÃ¨tre validÃ©
  ou une entrÃ©e historique.
- Chaque entrÃ©e Claude contient uniquement : lot et objectif, branche/commit
  s'ils existent, Ã©tat (**en cours**, **Ã  relire**, **bloquÃ©** ou **terminÃ©**),
  faits et fichiers rÃ©ellement touchÃ©s, validations rÃ©ellement exÃ©cutÃ©es et
  leurs rÃ©sultats, risque/blocage, puis prochaine action. Une validation non
  exÃ©cutÃ©e reste explicitement Â« non exÃ©cutÃ©e Â» ; aucun secret, donnÃ©e
  personnelle, lien de session ou rÃ©sultat inventÃ© n'y est ajoutÃ©.
- Claude exÃ©cute le besoin demandÃ© par l'utilisateur en tenant compte de ce
  document. Son droit d'ajout ne l'autorise pas Ã  modifier les dÃ©cisions produit
  ni Ã  approuver seul un commit, push, fusion, dÃ©ploiement, migration distante
  ou action Stripe. Il termine aussi par un rÃ©sumÃ© court pour l'utilisateur.
- Codex compare ce document au dÃ©pÃ´t lors de sa prochaine revue. Toute ligne
  prouvÃ©e comme faite passe dans **TerminÃ©** ; seules les lignes non rÃ©alisÃ©es
  restent dans **Ã€ exÃ©cuter** ou **BloquÃ©**.

## Journal d'avancement Claude

> Claude ajoute ses entrÃ©es les plus rÃ©centes juste sous cette note, sans effacer
> les prÃ©cÃ©dentes. Ce journal dÃ©crit l'exÃ©cution ; les dÃ©cisions et prioritÃ©s
> Codex restent dans les sections qui suivent.

### 2026-08-07 (soir) â€” Fusion des PR #128 et #129 sur ordre propriÃ©taire â€” **terminÃ©**

- **Lot et objectif** : ordre direct du propriÃ©taire â€” Â« migre tout dÃ¨s la
  rÃ©ponse de la CI Â». Les deux CI Ã©taient intÃ©gralement vertes.
- **Faits** : PR #128 (apparence dashboard) fusionnÃ©e en squash `0c018fd`
  (CI verte sur `509b6a5`) ; puis `main` mergÃ© dans
  `chantier/themes-cartoon`, conflit de docs rÃ©solu (les deux PR
  revendiquaient V1.48/ADR-092 depuis le mÃªme `main`) : #128 garde
  **V1.48/ADR-092**, le chantier thÃ¨mes est renumÃ©rotÃ© **V1.49/ADR-093**
  (roadmap, decisions, bugs, CLAUDE.md) ; PR #129 fusionnÃ©e aprÃ¨s re-CI
  verte sur le commit de merge. Une advisory npm ambiante (dompurify via
  posthog-js, GHSA-55q2-fjhq-7xh7) avait Ã©tÃ© fermÃ©e sur les deux branches
  par bump de lockfile avant fusion.
- **Validations exÃ©cutÃ©es** : CI complÃ¨te verte des deux PR avant fusion
  (E2E 3 navigateurs, pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build,
  audit, site) ; re-CI sur le merge de `main` dans #129 avant sa fusion ;
  vÃ©rification post-fusion de l'application de la migration
  `20260917120000` et du workflow Â« SantÃ© aprÃ¨s dÃ©ploiement Â» sur `main`.
- **Risque/blocage** : aucun. Les entrÃ©es dÃ©taillÃ©es des deux chantiers
  sont ci-dessous, Ã©crites avant fusion (leurs mentions Â« PR ouverte /
  dÃ©cision propriÃ©taire en attente Â» sont donc dÃ©passÃ©es par la prÃ©sente).
- **Prochaine action** : aucune en attente cÃ´tÃ© Claude.

### 2026-08-07 â€” Fonds thÃ©matiques cartoon â€” **Ã  relire**

- **Lot et objectif** : demande directe du propriÃ©taire â€” quand un thÃ¨me est
  choisi (NoÃ«l, Saint-Valentinâ€¦), le fond doit suivre : remplacer les lignes
  fades par des dÃ©cors cartoon (rennes, tÃªtes de PÃ¨re NoÃ«l, sucres
  d'orgeâ€¦), sur toutes les surfaces et aussi pour les pronostics (qui
  n'avaient encore aucun thÃ¨me).
- **Branche/commits** : `chantier/themes-cartoon`, 4 commits au-dessus de
  `main` (`56874f3`) â€” PR Ã  ouvrir vers `main` (**non fusionnÃ©e**, dÃ©cision
  propriÃ©taire en attente). `030265c` (DB, migration
  `20260917120000_themes_saisonniers.sql`), `7286746` (backend), `cce05a6`
  (frontend), `e8a1f89` (durcissement INFO-1).
- **Faits et fichiers** : `contests.theme` reÃ§oit la mÃªme palette 6 clÃ©s
  que `calendars.theme` (aucune deuxiÃ¨me enum). `updateContest` accepte
  `theme` en optionnel-prÃ©servant. `src/lib/seasonal-theme.ts` devient la
  source unique de l'enum. `ThemeDecor` (16 scÃ¨nes, 28 motifs cartoon,
  13 emplacements dÃ©terministes) posÃ© sur `PlayerPageShell` (les 4 shells
  joueur factorisÃ©s), `/play`, et les 3 aperÃ§us Ã©diteurs (calendrier, quiz,
  roue). Pronostics gagne un sÃ©lecteur 6 vignettes et une Saint-Valentin
  restylÃ©e. `Object.hasOwn` ajoutÃ© sur les 3 tables de tokens (INFO-1 de
  la revue sÃ©curitÃ©).
- **Validations rÃ©ellement exÃ©cutÃ©es** : typecheck 0, lint 0, Vitest
  238 fichiers / 3803 tests, build vert, migrations:check 121 (tÃªte
  `20260917120000`), sql:check ok, casts:check ok, pgTAP 56 fichiers /
  3172 assertions PASS (base vide et semÃ©e), E2E ciblÃ© WSL (pronostics,
  calendar, quiz, player-win â€” 3 projets, scans axe) : 42 passed / 6
  skipped / 0 failed. Revue sÃ©curitÃ© dÃ©diÃ©e exÃ©cutÃ©e : GO, 0
  critique/Ã©levÃ©/moyen/faible, 4 INFO (1 corrigÃ©e avant fusion, 3 en suivi
  `docs/bugs.md`). CI GitHub Actions **non jouÃ©e** au moment de l'Ã©criture
  de cette entrÃ©e (la PR la jouera dÃ¨s son ouverture) â€” explicitement non
  exÃ©cutÃ©e.
- **Risque/blocage** : cette branche part de `main` **sans** la PR #128
  (Â« apparence dashboard Â», ouverte, non fusionnÃ©e), qui modifie aussi
  CLAUDE.md/journal/roadmap/handoff/bugs. Un conflit de docs trivial est
  attendu entre les deux PR â€” la seconde fusionnÃ©e devra merger `main`
  d'abord (gotcha squash-branches-chaÃ®nÃ©es dÃ©jÃ  connu du dÃ©pÃ´t). Ordre de
  dÃ©ploiement Ã  respecter Ã  la fusion : la migration doit prÃ©cÃ©der la
  promotion du build Vercel (sinon 42703 cÃ´tÃ© `/pronos` le temps de la
  fenÃªtre).
- **Prochaine action** : ouvrir la PR, attendre la CI complÃ¨te, puis
  dÃ©cision propriÃ©taire de fusion (comme #125, #126, #127).

### 2026-08-07 â€” Apparence dashboard : clartÃ© et rappels fermables â€” **Ã  relire**

- **Lot et objectif** : demande directe du propriÃ©taire â€” amÃ©liorer
  l'apparence et la clartÃ© du dashboard, 7 points, sans migration.
- **Branche/commits** : `chantier/apparence-dashboard` (5 commits au-dessus
  de `main` `56874f3`) â€” **aucune migration**. `eaf50a2` (shell : fin du
  dÃ©bordement horizontal, sidebar dÃ©filante, rappels fermables), `dabf9ec`
  (page du jeu repliable + QR embarquÃ©), `18dddd1` (titres de cartes
  uniformisÃ©s), `4b77353` (accueil dÃ©doublonnÃ©, Conseiller fermable),
  `1cb13a5` (revue sÃ©curitÃ© fermÃ©e avant PR : 2 MOYEN + 3 INFO corrigÃ©s).
  **PR #128 ouverte vers `main`** (CI lancÃ©e sur `6d0d902`) ; fusion =
  dÃ©cision propriÃ©taire (comme #125, #126, #127).
- **Faits et fichiers** : slot actions de `PageHeader` (`min-w-0 max-w-full`
  au lieu de `shrink-0`) et 8 formulaires de crÃ©ation bornÃ©s (`max-w-xl`)
  corrigent le dÃ©bordement Ã  la source. `src/lib/rappels.ts` (pur, testÃ©) +
  `src/actions/rappels.ts` + `RappelFermable` : rappels fermables par cookie
  Ã  liste blanche de prÃ©fixes de clÃ© (les 3 bandeaux bloquants restent
  impossibles Ã  fermer par construction) ; voir ADR-092. Page dÃ©tail
  campagne : 6 blocs repliables via `CarteRepliable` (bouton `aria-expanded`,
  pas `<details>` â€” Chromium retire le rÃ´le heading aux descendants d'un
  `<summary>`) ; QR embarquÃ© directement sur la page du jeu, fin de
  l'aller-retour vers l'onglet QR Codes. `Card` impose dÃ©sormais
  `[&>h2]:text-lg [&>h2]:font-black` en un point unique (67 titres alignÃ©s).
  Accueil : suppression des 4 rÃ¨gles opÃ©rationnelles du Conseiller
  redondantes avec des tuiles existantes ; Conseiller fermable.
- **Validations exÃ©cutÃ©es** : typecheck 0, lint 0, Vitest **237 fichiers /
  3806 tests** verts, migrations:check / sql:check / casts:check ok, build
  vert (46 pages) â€” campagne locale complÃ¨te. **CI distante pas encore
  jouÃ©e au moment de l'Ã©criture** (la PR la dÃ©clenchera). E2E ciblÃ© WSL
  (Supabase reset+seedÃ©, build rÃ©el, 3 projets) sur dashboard-home,
  referral, wheel-wizard, campaign-templates : 35 passed / 1 skipped /
  1 failed â€” l'unique rouge est un flake WebKit prÃ©existant sur la caisse
  (titre du test porte dÃ©jÃ  Â« comportement prÃ©existant Â»), confirmÃ© bÃ©nin
  par rejeu isolÃ© Ã—3 vert.
- **Risque/blocage** : aucun technique. Fusion = dÃ©cision propriÃ©taire.
- **Prochaine action** : ouvrir la PR vers `main`, fusion sur dÃ©cision
  propriÃ©taire. Chantier suivant annoncÃ© par le propriÃ©taire : fonds
  thÃ©matiques cartoon par thÃ¨me (dÃ©cors SVG, thÃ¨me pronostics avec
  migration `contests.theme`), en prÃ©paration, PR sÃ©parÃ©e.

### 2026-08-07 â€” L'Atelier partout : extension aux 7 modules de crÃ©ation â€” **Ã  relire**

- **Lot et objectif** : demande directe du propriÃ©taire â€” Â« fais l'extension
  du modÃ¨le atelier aux autres modules de crÃ©ation Â», aprÃ¨s fusion de
  V1.46. GÃ©nÃ©raliser le patron des deux visages (vue suivi / atelier par
  `?etape=`) livrÃ© sur la roue aux 7 modules restants : quiz, calendrier de
  l'Avent, chasse au trÃ©sor, passeport de fidÃ©litÃ©, jackpot collectif,
  Ã©vÃ©nement live, pronostics.
- **Branche/commits** : `chantier/atelier-modules`, PR #127 ouverte vers
  `main` (**non fusionnÃ©e**, dÃ©cision propriÃ©taire en attente) â€” **aucune
  migration**. `3390c63` (primitives gÃ©nÃ©riques extraites de la roue),
  `1cd2595` (chasse + fidÃ©litÃ©), `fe79eeb` (quiz + calendrier), `fde377c`
  (pronostics), `3160e61` (jackpot + Ã©vÃ©nement), `573270b` (factorisation :
  porte d'entrÃ©e unique, type `ControleActivation` partagÃ©, 2 correctifs
  INFO sÃ©curitÃ©), `cd7648b` (specs E2E des 7 ateliers + balayage a11y),
  `fbbe7e2` + `76341d4` + `93319ea` (trois tours de correction CI).
- **Faits et fichiers** : chaque route dÃ©tail garde une seule URL â€” sans
  `?etape=`, vue suivi (Carte de l'Aventure, statut, QR/stats/classement,
  relance, porte Â« Ouvrir l'atelier Â») ; avec `?etape=`, mode atelier
  (stepper Kermesse, une carte par Ã©tape). Primitives gÃ©nÃ©riques
  `atelier-etapes.ts` / `AtelierStepper` / `AtelierNavigationEtape`
  extraites de la roue V1.46, qui migre dessus sans changer de comportement
  (`e2e/wheel-wizard.spec.ts` vert sans modification). ZÃ©ro migration, zÃ©ro
  nouvelle action : chaque Ã©tape poste une action existante complÃ¨te ; les
  5 cartes RÃ©glages monolithiques restent des Ã©tapes indivisibles.
  PrÃ©conditions de publication (`activationBlocker` de quiz/calendar/
  jackpot, blocs inline de hunts/loyalty/events) extraites en modules purs
  testÃ©s sous `src/lib/activation/` (7 modules + `controle.ts`), consommÃ©s
  par l'action ET par l'Ã©tape Â« La vÃ©rification Â». Trois bugs vivants
  corrigÃ©s : pronostics effaÃ§ait `default_locks_at` sur un
  no-op (`contest-settings.tsx:446-450`, hidden dÃ©sormais prÃ©-rempli,
  bouton grisÃ© prouvÃ© par E2E) ; cinq 404 injustifiÃ©s sur des pages dÃ©tail
  refusant le droit payÃ© alors que le brouillon est gratuit
  (`capacitesDuModule` + `ModuleCapabilityNotice`) ; deux ancres
  `#reglages` menteuses et un Ã©cran comptoir jackpot hors de son mode.
  Nouvelle spec `e2e/atelier-modules.spec.ts` (19 tests, premiers E2E et
  scans axe de ces 7 pages) a fait fermer sur trois tours de CI des
  violations de contraste prÃ©existantes (liens retour zinc-500, liens
  orange bruts des affiches/cartes de commande â€” dette V1.45 pelÃ©e sur ces
  surfaces) et dÃ©busquÃ© un invariant : une case de calendrier ne peut pas
  devenir invalide par Ã©dition, le serveur la refuse.
- **Validations exÃ©cutÃ©es** : typecheck 0 ; lint 0 ; casts:check 0 ;
  migrations:check 120 (aucun SQL) ; sql:check ok ; Vitest **235 fichiers /
  3775 tests** ; build vert. **CI complÃ¨te VERTE sur `93319ea`** (run
  31188136154). Revue sÃ©curitÃ© dÃ©diÃ©e : **GO, 0 critique/Ã©levÃ©/moyen** â€”
  l'Ã©largissement d'accÃ¨s ne change que Â« qui voit sa propre donnÃ©e Â», la
  publication reste verrouillÃ©e en base via `assert_module_publish_allowed`
  (inchangÃ©), 2 INFO corrigÃ©es avant fusion, 2 INFO en suivi (`docs/bugs.md`).
- **Risque/blocage** : aucun technique â€” la CI est verte de bout en bout.
  Seul point en attente : dÃ©cision du propriÃ©taire sur la fusion de la PR
  #127 (comme #125 et #126, toujours en attente). Hors pÃ©rimÃ¨tre assumÃ© et
  consignÃ© (roadmap V1.47, `docs/bugs.md`) : cinq schÃ©mas monolithiques non
  assouplis en partiel, garde de publication en base absente pour
  pronostics (rien cÃ´tÃ© serveur), 3 formulaires `updateContest` non
  fusionnÃ©s, questions de pronostics INSERT-only, leaderboard quiz non lu,
  `createLoyaltyOrderCodes` sans garde de module propre (impact nul).
- **Prochaine action** : dÃ©cision propriÃ©taire sur la fusion des PR #125,
  #126 et #127 vers `main`. Aucune action Claude en attente sur ce lot.

### 2026-08-07 â€” L'Atelier du jeu â€” **Ã  relire**

- **Lot et objectif** : demande directe du propriÃ©taire â€” Â« lance le
  chantier proposÃ© Â», l'assistant de crÃ©ation en Ã©tapes proposÃ© en clÃ´ture
  de la refonte clartÃ© V1.45. Accompagnement guidÃ© et DÃ‰TERMINISTE, sans IA
  (dÃ©cision propriÃ©taire du retrait de l'IA payante rÃ©affirmÃ©e).
- **Branche/commits** : `chantier/assistant-creation`, PR #126 ouverte vers
  `main` (**non fusionnÃ©e**) â€” **aucune migration**. `d009bf6` (5 Ã©tapes
  nommÃ©es, la roue se rÃ¨gle par carte), `7b19ee1` (extraction `partSur10` en
  module pur partagÃ© Lots/VÃ©rification), `2682708` (spec E2E + scan axe de
  bout en bout), `146aed1` + `0faa05a` (correctifs des 13 violations
  d'accessibilitÃ© dÃ©busquÃ©es par le nouveau scan axe : contrastes, selects
  et cases sans nom accessible).
- **Faits et fichiers** : diagnostic prÃ©alable (5 explorateurs) sur
  `/dashboard/campaigns/[id]/wheel` â€” 102 contrÃ´les interactifs simultanÃ©s,
  6 actions d'Ã©criture sur 12 boutons Enregistrer sans Ã©tat global,
  Â« Ouvrir aux joueurs Â» sans prÃ©condition mÃ©tier, 13 mÃ©caniques sur 15 sans
  effet visible des rÃ©glages, aucune spec E2E ni scan axe. La page devient
  l'Atelier : 5 Ã©tapes (Le jeu / Les lots / L'habillage / Le crÃ©neau / La
  vÃ©rification) navigables par `?etape=` sur la MÃŠME route (les 6
  `revalidatePath` restent valides), zÃ©ro nouvelle action serveur, zÃ©ro
  migration â€” chaque Ã©tape poste une sauvegarde EXISTANTE complÃ¨te. Ã‰tape
  VÃ©rification : `src/components/dashboard/atelier-verification-state.ts`,
  module pur testÃ©, lot gagnant tirable au miroir de
  `perform_atomic_spin`, CTA unique vers `#statut` (seul endroit qui
  publie). `createCampaign` redirige dÃ©sormais vers l'Atelier ;
  `applyCampaignTemplate` garde le dÃ©tail. Nouvelle spec
  `e2e/wheel-wizard.spec.ts` (8 tests, premier E2E et premier scan axe de
  cette page).
- **Validations exÃ©cutÃ©es** : typecheck 0 ; lint 0 ; Vitest **225 fichiers /
  3654 tests** ; build vert. **CI complÃ¨te VERTE sur `0faa05a`** (run
  31167771881 : E2E 3 navigateurs dont la nouvelle spec wheel-wizard,
  pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build, audit). Revue sÃ©curitÃ©
  dÃ©diÃ©e **non requise** selon la rÃ¨gle du dÃ©pÃ´t : aucune migration, route
  API, auth, RLS, webhook ni token touchÃ©s â€” seule la cible d'un redirect
  interne change (documentÃ© explicitement, pas une omission).
- **Risque/blocage** : aucun technique â€” la CI est verte de bout en bout.
  Le seul point en attente est une dÃ©cision du propriÃ©taire sur la fusion
  de la PR #126 (comme la PR #125, toujours en attente). Hors pÃ©rimÃ¨tre
  assumÃ© et consignÃ© (roadmap V1.46, bugs.md) : prÃ©conditions de
  publication en base (`set_campaign_status` sans garde mÃ©tier), toggle
  `is_active`, rÃ©ordonnancement des segments, quota brouillon sur
  `applyCampaignTemplate`.
- **Prochaine action** : dÃ©cision propriÃ©taire sur la fusion des PR #125 et
  #126 vers `main`. Aucune action Claude en attente sur ce lot.

### 2026-08-07 â€” Refonte clartÃ© espace commerÃ§ant â€” **Ã  relire**

- **Lot et objectif** : demande directe du propriÃ©taire â€” l'espace
  commerÃ§ant beaucoup plus clair, plus ludique, plus simple ; savoir
  immÃ©diatement oÃ¹ l'on est et quoi faire ; Ã©tapes prÃ©cises ; fin des
  Â« cases dans tous les sens Â». Cartographie prÃ©alable par 7 explorateurs
  parallÃ¨les, puis trois lots : Vue d'ensemble recomposÃ©e autour d'un hero
  Â« Votre prochaine action Â», navigation groupÃ©e en 4 zones avec en-tÃªtes
  unifiÃ©s, et un pas-Ã -pas exact (Ã©tats nommÃ©s, publication au mÃªme
  endroit sur les 8 pages dÃ©tail).
- **Branche/commits** : `chantier/clarte-commercant`, PR #125 ouverte vers
  `main` (**non fusionnÃ©e**) â€” **aucune migration**. `349ab27` (navigation
  groupÃ©e + correctif accÃ¨s offert au menu), `92a4223` (Vue d'ensemble),
  `62b41b4` (pas-Ã -pas exact), `57cd55e` (2 correctifs revue sÃ©curitÃ©),
  `e1ad5af` (merge `origin/main`, rÃ©solution du conflit du squash PR #124
  prouvÃ©e sans perte), `5be9f57` + `9aa56aa` + `5568f57` + `f0ba41d`
  (rÃ©paration E2E CI : locators nommÃ©s + token de contraste
  `--color-k-orange-text`).
- **Faits et fichiers** : hero `src/components/dashboard/prochaine-action.tsx`
  (+ `-state.ts`) absorbe la checklist d'onboarding ; fusion Centre
  d'animation + Tableau d'Ã©quipe ; Conseiller rÃ©duit Ã  4 conseils max ;
  correctif `layout.tsx` (accÃ¨s offert manquant dans
  `activeExperienceKinds`) ; `src/components/ui/status-badge.tsx` et
  `src/components/ui/page-header.tsx` nouveaux ; `experience-lifecycle.ts`
  ne montre plus Â« Bravo, prÃªte Ã  Ãªtre partagÃ©e ! Â» sur une campagne en
  pause (bug prouvÃ©, corrigÃ©) ; ancres `#reglages/#statut/#suivi/#relance`
  sur les 8 pages dÃ©tail ; token `--color-k-orange-text: #b45309` (4.66:1
  crÃ¨me, 5.02:1 blanc) appliquÃ© aprÃ¨s que le scan axe ajoutÃ© Ã 
  `e2e/dashboard-home.spec.ts` a trouvÃ© de vraies violations de contraste.
- **Validations exÃ©cutÃ©es** : typecheck 0 ; lint 0 ; `casts:check` 0 ;
  `migrations:check` 120 (aucun SQL, aucune migration) ; `sql:check` ok ;
  Vitest **222 fichiers / 3626 tests** ; build vert. **CI complÃ¨te VERTE
  sur `f0ba41d`** (run 31158677255 : E2E Chromium+WebKit 3 projets,
  pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build, audit npm, site
  vitrine). Revue sÃ©curitÃ© dÃ©diÃ©e : **GO, 0 critique/Ã©levÃ©/moyen**, 2 INFO
  corrigÃ©s avant fusion, 2 INFO laissÃ©s en suivi dans `docs/bugs.md`
  (pages en lecture seule sans redirect de rÃ´le, prÃ©existant ; liens
  orange sous 4.5:1 hors pages scannÃ©es par le nouveau token).
- **Risque/blocage** : aucun technique â€” la CI est verte de bout en bout.
  Le seul point en attente est une dÃ©cision du propriÃ©taire sur la fusion
  de la PR #125. Hors pÃ©rimÃ¨tre assumÃ© et consignÃ© (roadmap V1.45,
  bugs.md) : wizard de crÃ©ation multi-Ã©crans, boutons Â« Enregistrer Â»
  multiples sans Ã©tat global, unification des 9 cartes de caisse,
  gÃ©nÃ©ralisation de `PageHeader` aux pages dÃ©tail.
- **Prochaine action** : dÃ©cision propriÃ©taire sur la fusion de la PR #125
  vers `main`. Aucune action Claude en attente sur ce lot.

### 2026-08-06 â€” Correctif produit : l'IA payante retirÃ©e, un conseiller gratuit Ã  la place â€” **terminÃ©**

- **Lot et objectif** : le lot D (Â§9.5, assistant de crÃ©ation) avait Ã©tÃ© livrÃ©
  avec un **appel Ã  l'API payante d'Anthropic** (facturation au jeton). **Le
  propriÃ©taire ne voulait pas d'IA facturÃ©e** â€” il voulait un accompagnement
  simple, dans le code, gratuit. Ce lot **retire** l'IA payante et la
  **remplace** par un conseiller dÃ©terministe.
- **Branche/commits** : `chantier/conseiller-gratuit` â€” **aucune migration**.
  Revert du lot D `be7fdef` ; conseiller `e98f2c7` (rÃ¨gles) + `dd01c3a`
  (panneau) ; correctif perf `page.tsx` + retrait du wrapper sans appelant
  (`66cdd31`) ; docs `67169c8`.
- **Faits et fichiers** : retrait complet de l'assistant IA payant
  (`ia-provider`, `ia-assistant`, `ANTHROPIC_API_KEY`, `iaSuggestion`, 3áµ‰ source
  `blueprint`), prouvÃ© sans rÃ©sidu (`git grep` = 0 hors docs). Conseiller
  `src/lib/conseiller-commercant.ts` â€” fonction **pure** `construireConseils`,
  **zÃ©ro appel externe, zÃ©ro clÃ©, zÃ©ro coÃ»t** : de simples rÃ¨gles sur les
  compteurs dÃ©jÃ  chargÃ©s du Centre d'animation + le catalogue. Ton **sobre,
  informatif, non commercial**. Trois catÃ©gories (opÃ©rationnel / module /
  dÃ©couverte), bornÃ©es Ã  6, hrefs filtrÃ©s par `lienSelonRole`. Panneau sur
  `/dashboard`. La revue sÃ©curitÃ© a fait corriger une RPC en double (le
  conseiller rÃ©utilise dÃ©sormais les compteurs dÃ©jÃ  chargÃ©s, pas de seconde
  requÃªte) et retirer le wrapper devenu sans appelant.
- **Validations exÃ©cutÃ©es** : typecheck 0 ; lint 0 ; casts:check 0 ;
  migrations:check 120 (aucun SQL) ; sql:check ok ; Vitest **220 fichiers /
  3567 tests** ; build vert. Revue sÃ©curitÃ© dÃ©diÃ©e : **GO, 0 critique/Ã©levÃ©/
  moyen** (retrait sans rÃ©sidu, lecture seule sur donnÃ©es de session, aucun
  secret, texte Ã©chappÃ©, hrefs filtrÃ©s par rÃ´le).
- **Risque/blocage** : aucun. Le conseiller n'est **pas une IA** â€” il applique
  des rÃ¨gles, il ne Â« comprend Â» rien ; extensible sans coÃ»t. Plus aucune
  dÃ©pendance payante dans le produit.
- **Prochaine action** : PR puis fusion. AprÃ¨s ce correctif, plus rien du Â§9
  n'est en suspens et aucune facturation IA ne subsiste.

### 2026-08-06 â€” Lot D (Â§9.5) : IA MVP, l'assistant de crÃ©ation dormant â€” **RETIRÃ‰** (voir entrÃ©e du dessus)

> Cette entrÃ©e dÃ©crit un lot **annulÃ©** : l'assistant de crÃ©ation qu'elle
> documente appelait l'API payante d'Anthropic ; le propriÃ©taire l'a fait
> retirer le mÃªme jour, remplacÃ© par le conseiller gratuit ci-dessus. ConservÃ©e
> pour la traÃ§abilitÃ© de la dÃ©cision.

### 2026-08-06 â€” Lot C (Â§9.4) : Passeport post-jeu + QR de commande unique â€” **terminÃ©**

- **Lot et objectif** : le point 4 de l'ordre d'exÃ©cution impÃ©ratif (Â§9) et le
  Â§7 du cahier. Deux moitiÃ©s : une invitation au Passeport aprÃ¨s un jeu, et un
  QR de commande unique pour la livraison/e-commerce.
- **Branche/commits** : `chantier/passeport-post-jeu` â€” migrations
  `20260915120000` (`loyalty_order_codes` + `record_loyalty_stamp` 5-aire) et
  `20260916120000` (hygiÃ¨ne : retrait du droit `delete`, purge du `label`).
  Commits `0f8d41b` â†’ `c74b85c`.
- **Faits et fichiers** : **C1** â€” action publique `invitationPasseport`
  (anti-oracle : org inconnue â‰¡ sans programme â‰¡ module fermÃ© â†’ mÃªme `null` ;
  sortie bornÃ©e Ã  `{programId, programName}`), composant `ProposerPasseport`
  sur 8 Ã©crans de fin (gagnÃ© ET perdu â€” le cahier ne distingue pas) + les
  13 jeux de rÃ©vÃ©lation, strictement navigationnel (un lien ne tamponne
  jamais, vrai par construction), garde un-exemplaire-par-page. **C2** â€”
  `loyalty_order_codes` (jeton copiÃ© de `hunt_steps`), `record_loyalty_stamp`
  gagne `p_order_token` : usage unique **atomique** (`update â€¦ where
  consumed_at is null returning`), le jeton contourne le cooldown (l'anti-abus
  est l'usage unique), Ã©tat `order_invalid` ; page `/commande/[token]`
  mobile-first, bloc marchand avec export PNG par lot. Trouvailles : dix tables
  d'Ã©mission (le calendrier en porte deux) ; une FK composite en cascade aurait
  fait de la purge RGPD une machine Ã  ressusciter les jetons dÃ©pensÃ©s (FK
  simple retenue) ; l'oracle Turnstile trouvÃ© par son propre test anti-oracle.
- **Validations exÃ©cutÃ©es** : typecheck 0 ; lint 0 ; casts:check 0 ;
  sql:check ok ; migrations:check 120 / tÃªte `20260916120000` ; Vitest
  **218 fichiers / 3554 tests** ; build vert ; pgTAP **55 fichiers /
  3143 assertions** PASS base vide ET semÃ©e ; security:audit-db 540 ; preuve
  mesurÃ©e de l'embed PostgREST sur base rÃ©elle (HTTP 200). Revue sÃ©curitÃ©
  dÃ©diÃ©e : **GO, 0 critique/Ã©levÃ©, 2 MOYEN + 3 FAIBLE â€” les cinq fermÃ©s avant
  fusion** (Set-Cookie qui trahissait le jeton â†’ pose diffÃ©rÃ©e ; page sans
  compteur de pression â†’ seau IP fail-open ; commentaire Turnstile faux â†’
  corrigÃ© ; rÃ©surrection de jeton par delete/insert â†’ droit `delete` retirÃ© ;
  `label` non purgÃ© â†’ purge Ã©tendue).
- **Risque/blocage** : le 404/200 de la page `/commande` reste ouvert (assumÃ©,
  identique Ã  `/hunt`) ; ni pÃ©remption ni rÃ©vocation des jetons en MVP ; le
  jeton voyage dans l'URL (comme `/hunt`). Tous consignÃ©s dans bugs.md.
- **Prochaine action** : PR puis fusion (ordre utilisateur du jour), puis
  lot Â§9.5 (IA MVP â€” assistant de crÃ©ation dormant sans clÃ©).

### 2026-08-06 â€” Lot B (Â§9.3) : Dashboard guidÃ©, Carte de l'Aventure, Relance, Tableau d'Ã©quipe, Centre d'animation â€” **terminÃ©**

- **Lot et objectif** : le point 3 de l'ordre d'exÃ©cution impÃ©ratif (Â§9) et les
  cinq dÃ©cisions du Â§5. Quatre starters Codex (composants purs, non commitÃ©s,
  worktrees du 2026-08-03) intÃ©grÃ©s aprÃ¨s correction (lint, accents,
  Ã©tiquettes honnÃªtes) ; le cinquiÃ¨me (carte de partage) Ã©tait dÃ©passÃ© par
  `PublicShare` (V1.37) et a Ã©tÃ© Ã©cartÃ©.
- **Branche/commits** : `chantier/dashboard-guide` â€” migration
  `20260914120000` (RPC `org_animation_center_counts`), commits `40fcc16` â†’
  `f9a8f28` (14 commits).
- **Faits et fichiers** : Centre d'animation + Tableau d'Ã©quipe sur
  `/dashboard` (RPC unique au lieu de 18 allers-retours ; compteurs Ã©tiquetÃ©s
  honnÃªtement : Â« QR jamais scannÃ©s Â», Â« Stocks faibles (roue) Â» ; tÃ¢ches
  d'Ã©quipe dÃ©rivÃ©es, jamais inventÃ©es ; liens filtrÃ©s par `lienSelonRole`).
  Carte de l'Aventure sur 8 pages de dÃ©tail (5 phases du cahier ; Ã©tat
  Â« prÃªte Â» ajoutÃ© â€” publiÃ©e mais pas jouable â€” sans lui la Carte aurait
  affichÃ© Â« ouverte aux joueurs Â» sur une page inatteignable ; parrainage
  exclu, sans statut propre). Â« Relancer une formule Â» sur 6 modules
  (sÃ©rialiseur instanceâ†’blueprint, structure et rÃ©glages seulement, jamais de
  donnÃ©es joueur ; campagnes â†’ Dupliquer existant ; jackpot non portable).
  Info-bulles sur les 8 formulaires de crÃ©ation. Spec E2E
  `dashboard-home.spec.ts`. Correctif d'outillage : `run-e2e-local.sh`
  appelait la CLI supabase en binaire global inexistant.
- **Validations exÃ©cutÃ©es** : typecheck 0 ; lint 0 ; casts:check 0 ;
  sql:check ok ; migrations:check 118/synchronisÃ©e ; Vitest **212 fichiers /
  3460 tests** verts (arbre final) ; build vert ; pgTAP **53 fichiers /
  3049 assertions** PASS sur base vide ET semÃ©e ; security:audit-db 535.
  Revue sÃ©curitÃ© dÃ©diÃ©e : **GO, 0 critique/Ã©levÃ©, 2 MOYEN fermÃ©s avant
  fusion** (refus de relance invisibles â†’ `RelanceErreur role="alert"` ;
  discriminant de nom venu du client â†’ dÃ©rivÃ© serveur, seau 10 s). E2E ciblÃ©
  local : **non exÃ©cutÃ©** (bloquÃ© par le dÃ©faut d'outillage ci-dessus,
  corrigÃ© depuis) â€” relancÃ©, et la CI de la PR joue la suite complÃ¨te.
- **Risque/blocage** : plafond de relance 1 blueprint/10 s/source (un vrai
  rate-limit dashboard serait un chantier Ã  part) ; jetons d'Ã©tape de chasse
  lisibles par le rÃ´le caisse (prÃ©existant, consignÃ© OUVERT dans bugs.md).
- **Prochaine action** : PR puis fusion (ordre utilisateur du jour), puis
  lot Â§9.4 (Passeport post-jeu + QR de commande unique).

### 2026-08-06 â€” Lot A : la classe Â« champ non rendu Â» fermÃ©e au schÃ©ma â€” **terminÃ©**

- **Lot et objectif** : fermer la classe Â« `FormData.get` rend `null` pour un
  champ non rendu Â» â€” les deux modes de panne, pas seulement le bruyant â€” et la
  verrouiller mÃ©caniquement. PrÃ©alable aux lots Â§9.3/Â§9.4/Â§9.5 qui ajoutent des
  formulaires.
- **Branche/commits** : `chantier/formulaires-null-classe`, commits `db4e54e`,
  `e255297`, `f5fbe55`, `61281c9`, `f04e9bf`, docs `323e7c4`.
- **Faits et fichiers** : mesure rÃ©elle de la classe : 26 violations (3
  bruyantes, 23 silencieuses â€” `z.coerce.number()` convertit `null` en 0 ; ne
  frappait que les bornes basses Ã  0, `min(1)` refusait `null` par accident).
  Les plus coÃ»teuses : trois cooldowns anti-rejeu (chasse, fidÃ©litÃ©, jackpot)
  dÃ©sarmables par un champ non rendu, et le poids d'un lot mis Ã  0 (jamais
  tirÃ©). LivrÃ© : `src/lib/validations/champ-formulaire.ts` (7 primitives),
  62 dÃ©clarations converties sur 12 modules, 98 `??` d'appelant supprimÃ©s (5
  survivent, commentÃ©s), garde comportementale
  `champ-formulaire-coverage.test.ts` (2 invariants sur 300+ champs de 24
  modules ; invariant Â« un requis refuse null Â» sans aucune exclusion ;
  37 exclusions JSON-only justifiÃ©es), 45 tests, contrÃ´les nÃ©gatifs jouÃ©s et
  restaurÃ©s. Docs : roadmap V1.41, ADR-084, bugs.md requalifiÃ© (l'entrÃ©e
  Â« CLOS Â» du 2026-08-05 comptait les rejets, pas les conversions silencieuses).
- **Validations exÃ©cutÃ©es** : typecheck 0 ; lint 0 ; casts:check 0 ;
  migrations:check ok (aucune migration au lot) ; sql:check ok ; Vitest
  **197 fichiers / 3303 tests** verts (+45) ; build vert. pgTAP **non exÃ©cutÃ©**
  (aucun SQL touchÃ©) ; E2E locale **non exÃ©cutÃ©e** (dÃ©lÃ©guÃ©e Ã  la CI).
- **Risque/blocage** : rÃ©siduel assumÃ© et documentÃ© â€” un champ rendu mais vidÃ©
  (`""`) vaut toujours 0 par coercition sur les entiers requis (comportement
  d'origine, hors classe).
- **Prochaine action** : PR puis fusion â€” **demandÃ©es explicitement par
  l'utilisateur ce jour** (Â« fusionne tout ce que tu as Ã  fusionner Â») â€” puis
  lot Â§9.3 (Dashboard guidÃ©, Carte de l'Aventure, Relancer une formule).

_Aucune entrÃ©e crÃ©Ã©e par Codex : Claude renseigne ce journal Ã  sa prochaine
avancÃ©e significative._

## DerniÃ¨re demande utilisateur

Codex pilote le dÃ©veloppement de LastChance. Les audits doivent Ãªtre prÃ©cis et
transverses ; les propositions doivent amÃ©liorer concrÃ¨tement l'expÃ©rience des
commerÃ§ants et des joueurs, la performance ou la sÃ©curitÃ©. Chaque demande,
constat, proposition et dÃ©cision Codex doit Ãªtre consignÃ© ici.

## Ã‰tat vÃ©rifiÃ© par Codex â€” 2026-08-04 (Ã  lire avant un nouveau lot)

**Constat de dÃ©pÃ´t, en lecture seule :** le clone consultÃ© est sur `main`, sans
modification locale, Ã  `0b41219` (Â« P0 lot 2 Â»). Aucun chantier en cours n'est
visible dans l'arbre Git. Ceci ne vaut pas observation d'une session Claude :
Codex ne les lit pas. Les preuves de tests ci-dessous sont celles consignÃ©es
dans les commits intÃ©grÃ©s ; elles restent Ã  requalifier localement avant une
nouvelle livraison ou une mutation distante.

| Sujet | Ã‰tat rÃ©el | Ce que cela apporte | Limite restante |
| --- | --- | --- | --- |
| Catalogue et site public | **TerminÃ© dans `e93963f` / PR #98.** Les quatre offres et les huit add-ons dÃ©rivent du catalogue racine ; le site ne recopie plus prix, droits ni limites. | Le prospect lit la mÃªme offre que le dashboard. | Catalogue descriptif seulement : aucun produit, Price ID, checkout ou droit Stripe n'a Ã©tÃ© crÃ©Ã©. Le site n'a pas de runner de tests propre ; ses typecheck/lint/build doivent Ãªtre exÃ©cutÃ©s sÃ©parÃ©ment. |
| P0 lot 1 : publication payante | **TerminÃ© dans `623e1aa` / PR #99.** Les transitions de publication passent par des RPC SQL gardÃ©es : rÃ´le, droit du module, droit effectif et audit. | Un Ã©diteur ne peut plus activer un module par appel PostgREST direct lorsque le droit est absent ou inactif. | Le retour Ã  un brouillon reste volontairement permis ; ne pas le confondre avec une publication. |
| P0 lot 2 : droits datÃ©s et add-ons autonomes | **TerminÃ© dans `0b41219` / PR #102.** Un octroi porte ses fenÃªtres ; SQL et TypeScript restent en paritÃ© ; le back-office peut accorder, lire et rÃ©voquer les octrois non Stripe. | Une Chasse, un Quiz ou une SoirÃ©e achetÃ©e seule peut ouvrir son seul module, puis cesser de faÃ§on sÃ»re Ã  l'expiration. | Aucun flux de paiement/webhook ne crÃ©e encore ces octrois. Les montants et durÃ©es du catalogue ne sont pas injectÃ©s en base. |

### Prochain lot prÃ©cis proposÃ© Ã  Claude â€” P0.3 : rendre le dashboard cohÃ©rent avec le droit effectif

**HypothÃ¨se Ã  vÃ©rifier d'abord :** aucun `canExplore` ni `canEditDraft` n'est
prÃ©sent dans `src/` ou `site/`. Le seul `canPublish` trouvÃ© concerne la
publication d'une *version de blueprint* dans
`experience-blueprint-state.ts`, pas le droit effectif d'une expÃ©rience. La
rÃ¨gle Â« un brouillon non payÃ© par organisation et par module Â» n'a pas Ã©tÃ©
retrouvÃ©e. Les lots P0.1/P0.2 ferment la porte de publication en base ; ils ne
suffisent donc pas Ã  dÃ©montrer toute l'expÃ©rience de dÃ©couverte et de brouillon
du dashboard.

- **BÃ©nÃ©fice commerÃ§ant :** il peut prÃ©parer une animation sans payer ni se
  tromper sur ce qui est publiable ; un Ã©diteur sait quand demander au
  propriÃ©taire au lieu de tomber sur un Ã©chec technique.
- **PrioritÃ© :** P0, avant le QR universel. **CoÃ»t :** moyen (lecture droits,
  rÃ¨gles de brouillon, surfaces dashboard et tests). **Risque :** Ã©levÃ© si la
  sÃ©paration est seulement visuelle : les actions, routes et RPC doivent rester
  cohÃ©rentes avec les gardes SQL dÃ©jÃ  livrÃ©es.
- **PÃ©rimÃ¨tre autorisable aprÃ¨s validation utilisateur :** cartographier les
  neuf modules et leurs actions, dÃ©finir un type/contrat unique pour les trois
  capacitÃ©s, appliquer la limite de brouillon, rendre le message propriÃ©taire/
  Ã©diteur, puis tester les parcours sans droit, avec droit et Ã  expiration.
  Aucun checkout, produit Stripe, Price ID, appel rÃ©el Stripe, migration
  distante, commit, push ou dÃ©ploiement ne fait partie de ce lot sans accord
  distinct.
- **Preuves minimales :** migrations et pgTAP si le schÃ©ma Ã©volue ; tests
  TypeScript/actions pour les trois capacitÃ©s ; revue de toutes les routes/RPC
  de publication ; typecheck, lint, build racine et `npm --prefix site run
  typecheck`, `lint`, `build` si le site est touchÃ©. PrÃ©fÃ©rer WSL/Docker pour
  l'Ã©quivalent local avant CI.

**DÃ©cision attendue :** l'utilisateur confirme P0.3 ou choisit un autre lot.
Le QR universel sur une expÃ©rience pilote ne dÃ©marre qu'aprÃ¨s ce verdict P0.

## A LIRE EN PREMIER â€” decisions produit utilisateur (2026-08-04)

**Ce bloc est la source de verite produit pour Claude.** Il remplace les noms
historiques `Core / Engagement / Live & Events / Full Platform` encore presents
plus bas. Ne creer aucun produit Stripe, Price ID, checkout, abonnement ou
migration distante a partir des montants ci-dessous : ce sont les tarifs et
durees de reference produit, a revalider commercialement avant mise en vente.

### 1. Offres mensuelles â€” noms confirmes

| Offre | Promesse affichee |
| --- | --- |
| **Coup d'envoi** | lancer une animation |
| **Le Club** | fideliser |
| **Le Grand Jeu** | animer regulierement |
| **La Totale** | reunir toutes les briques |

Â« La Totale Â» remplace definitivement Â« La Grande Aventure Â». Les objectifs
restent des sous-titres : ils ne doivent pas etre deduits du seul nom de l'offre.

### 2. Add-ons â€” tous independants d'un abonnement

**Decision confirmee :** tout add-on peut etre achete seul. Il embarque les
briques communes strictement necessaires (organisation, QR/publication, lots,
caisse et gardes), sans deverrouiller les autres modules. Un client peut cumuler
plusieurs droits actifs, chacun borne a son module et, pour un pass, a sa
ressource propre.

| Add-on | Prix/duree de reference | Regle confirmee |
| --- | --- | --- |
| Passeport des habitues | 19 EUR/mois | recurrent, sans engagement, actif jusqu'a la fin de la periode payee |
| Bouche-a-oreille / Parrainage | 12 EUR/mois | recurrent, sans engagement, actif jusqu'a la fin de la periode payee |
| Chasse au tresor | 29 EUR / 30 jours | achat unique, activable dans les 90 jours |
| Calendrier a surprises | 29 EUR / une campagne jusqu'a 31 jours | achat unique, activable dans les 90 jours |
| Quiz express | 15 EUR / 7 jours | achat unique, activable dans les 90 jours |
| Cagnotte collective | 29 EUR / 30 jours | achat unique, activable dans les 90 jours |
| Saison de pronostics | 39 EUR / une competition | voir regle longue ci-dessous |
| Soiree en jeu | 10 joueurs : 9 EUR ; 30 : 19 EUR ; 50 : 29 EUR | voir regle de jauge ci-dessous |

Les mecaniques continues sont mensuelles ; les mecaniques de campagne ou
d'evenement sont des achats uniques a duree fixe. Aucun essai add-on : l'essai,
si conserve, reste celui de l'offre principale. Les credits SMS restent un achat
distinct sans expiration seulement quand Brevo/STOP/AF2M sont prets.

#### Regles particulieres validees

- **Saison de pronostics :** une seule competition identifiee et un seul
  `contest_id`, de l'activation jusqu'a sept jours apres la finale ou la cloture
  manuelle, avec plafond dur de douze mois. Ligue 1 et Ligue des champions ne
  doivent jamais etre coupees artificiellement a 90 jours. Les donnees restent
  consultables/exportables 30 jours apres ; le droit de jouer ne continue pas.
- **Soiree en jeu :** pass autonome incluant temporairement Coup d'envoi,
  Evenements et Quiz. Jauge choisie avant paiement, enregistree et jamais
  ajustee ou facturee retroactivement. Sept jours de preparation puis 24 heures
  de jeu, activation dans les 30 jours. Ne pas vendre de jauge superieure avant
  un benchmark de capacite live concluant.
- A l'expiration d'un pass, la ressource est mise en pause de facon sure ; les
  donnees et exports restent lisibles. Ne jamais prolonger silencieusement.

### 3. Dashboard ouvert, publication strictement payante

- Tous les neuf modules sont visibles avec leur cas d'usage, modele, tarif et
  etat d'acces. Un client peut preparer **un brouillon non paye par organisation
  et par module**, y compris depuis un blueprint.
- Le dashboard donne acces a tout pour decouvrir ; seule la **publication** est
  verrouillee au droit effectivement paye par l'offre ou l'add-on exact.
- Aucun QR, URL publique, ecran de salle, participation, caisse, lot, tirage,
  gain, remise ou campagne active ne peut sortir d'un brouillon non couvert.
- Un proprietaire peut acheter ; un editeur voit le catalogue mais recoit
  Â« Demander au proprietaire Â», jamais un controle Stripe.
- Apres webhook de paiement, le brouillon redevient **pret a publier**, sans
  ressaisie ; publier reste un clic explicite, jamais une exposition automatique.
- Separer et revalider partout `canExplore`, `canEditDraft` et `canPublish`.
  `comp_access` n'est pas un entitlement a tous les jeux ni un droit live.

### 4. QR universel â€” decision confirmee

Chaque jeu, quiz et experience joueur publiable doit proposer **un QR et un
lien**. Le lien reste compatible, mais n'est jamais l'unique entree. QR/lien ne
confere aucun droit, ne contient aucun secret et ne rend pas un brouillon,
module suspendu ou impaye jouable. Priorite : droits effectifs P0, puis QR.

### 5. Dashboard simple et ludique â€” decisions confirmees

- Creation guidee pas a pas pour chaque experience, avec informations-bulles et
  explications simples.
- **Carte de l'Aventure** : idee â†’ brouillon â†’ repetition â†’ en cours â†’ cloturee,
  avec fanions et tampons ; elle rend la progression lisible sans remplacer les
  vrais boutons.
- **Relancer une formule** : repartir d'une animation reussie vers un brouillon
  propre pour Noel, soldes, match ou anniversaire.
- **Tableau d'equipe** : rendre visuellement les actions attribuees au
  proprietaire, a l'editeur ou a la caisse.
- **Centre d'animation** : une vue des brouillons, QR a tester, jeux en cours,
  stocks faibles, gains a remettre et taches d'equipe.

### 6. IA â€” perimetre confirme

Assistant de creation uniquement : aide au choix et trois idees editables.
Sortie structuree cote serveur, sans PII joueur inutile, sans publication,
paiement ou action automatique. L'IA propose ; le commercant choisit et valide.

### 7. Passeport â€” continuite joueur confirmee

- Apres un jeu, proposer de creer ou continuer un Passeport, sans forcer la
  creation d'un compte.
- Un lien partage cree/continue le Passeport mais **n'ajoute jamais de tampon**.
- Un QR officiel marchand eligible ou un achat/caisse valide ajoute un tampon,
  de facon idempotente. Un QR transferable prouve le support officiel, pas la
  presence physique.
- Livraison/e-commerce : une carte/QR/code unique par commande cree/continue le
  Passeport apres confirmation et ajoute un tampon une seule fois. Code generique
  = zero tampon. L'integration API Uber Eats/Deliveroo reste future et non
  approuvee ; ne pas la commencer.

### 8. Pistes a ne pas demarrer sans nouvelle validation

Le jeu de deduction sociale inspire du loup-garou (Â« La Nuit des Masques Â»),
integrations caisse, API Uber/Deliveroo, Passeport des decouvertes, Bingo de
quartier, Kit de lancement, prochaine meilleure action, Player Hub complet,
Calendrier d'occasions et multi-etablissement restent des pistes a arbitrer,
pas des lots autorises.

### 9. Ordre d'execution imperatif

1. P0 : droit effectif unique, gardes SQL/actions/routes/RPC et transitions
   publiques impossibles sans droit.
2. QR universel sur une experience pilote.
3. Dashboard guide, Carte de l'Aventure et Relancer une formule.
4. Passeport post-jeu et QR de commande unique.
5. IA MVP, puis les pistes non validees seulement sur nouvelle demande.

## Registre Codex

| Date | Type | DÃ©cision / proposition | Ã‰tat |
| --- | --- | --- | --- |
| 2026-08-06 | Audit Codex complet, lecture seule | **P0.1 Ã  P0.5, QR universel, dashboard guidÃ© et Passeport/QR commande sont intÃ©grÃ©s Ã  `main`** ; le seul lot hors `main` est `chantier/conseiller-gratuit`, 7 commits devant (`896c4af`), sans migration. Retrait Anthropic et conseiller gratuit confirmÃ©s ; contrÃ´les locaux typecheck, migrations, casts et SQL verts. **CI de ce SHA rouge** : 5 E2E `dashboard-home` Ã©chouent car le nouveau conseil duplique le texte visÃ© par un sÃ©lecteur gÃ©nÃ©rique ; ne pas fusionner avant correction et CI complÃ¨te verte. pgtap/RLS et build CI sont verts ; CodeQL a Ã©chouÃ© sur indisponibilitÃ© GitHub, sans analyse ; audit/site ont Ã©tÃ© annulÃ©s. Restes produit rÃ©els : paiement Stripe de bout en bout, dÃ©cision RLS sur lecture des jetons de chasse par caisse, capacitÃ© live mesurÃ©e. | BloquÃ© avant PR/fusion |
| 2026-07-28 | Gouvernance | Audits complets menÃ©s avec les agents Codex pertinents ; propositions filtrÃ©es par impact client, preuve, risque et coÃ»t. | Actif |

## Archive â€” dernier constat Codex du 2026-07-28

- Aucun chantier Claude actif.
- Le lot Â« Packaging et prix Â» est dÃ©clarÃ© terminÃ© par Claude, mais reste Ã 
  relire et valider par Codex avant toute publication.
- L'arbre de travail contient des modifications non publiÃ©es de plusieurs lots
  (observabilitÃ© des workers, instrumentation des cron, Sentry/CSP et
  packaging). Elles sont Ã  prÃ©server et ne doivent pas Ãªtre mÃ©langÃ©es Ã  un
  commit sans pÃ©rimÃ¨tre explicitement confirmÃ©.
- Aucun commit, push, dÃ©ploiement, migration distante ni crÃ©ation Stripe n'est
  autorisÃ© par ce document.

## Livraison Codex â€” 2026-08-02 : P0 tests d'idempotence Stripe

- Les scÃ©narios 400/409 de `ensureStripeCustomer` simulent dÃ©sormais la course
  rÃ©elle : lecture initiale vide, erreur idempotente de `customers.create`, puis
  relecture de l'association gagnante. Chaque scÃ©nario vÃ©rifie que Stripe a Ã©tÃ©
  appelÃ© une fois ; le prÃ©cÃ©dent montage court-circuitait ce chemin.
- PÃ©rimÃ¨tre : `src/lib/stripe.test.ts` seulement. Aucun code de production,
  appel Stripe rÃ©el, migration, secret ou configuration externe.
- Preuves : revue QA indÃ©pendante, `npm test -- src/lib/stripe.test.ts` (57
  tests verts), `npm run typecheck`, `npm run lint` et `git diff --check`
  verts.

## TerminÃ© â€” Ã  prÃ©server

- Catalogue versionnÃ© de quatre offres : Core 29 â‚¬, Engagement 59 â‚¬, Live &
  Events 89 â‚¬, Full Platform 129 â‚¬.
- AccÃ¨s aux modules et messages d'upgrade alignÃ©s sur ce catalogue dans le
  dashboard.
- Paiement sÃ©curisÃ© par identifiants Stripe d'environnement : aucune somme de
  vitrine n'est facturable directement.
- Claude a dÃ©clarÃ© : tests unitaires, typecheck, lint, build et contrÃ´les de
  migrations verts. Ces preuves devront Ãªtre revÃ©rifiÃ©es avant publication.

## Archive â€” cahier dÃ©taillÃ© des six blocs du 2026-07-28

> Cet ancien cahier est conservÃ© pour traÃ§abilitÃ©. Les blocs 1 et 2 ont Ã©tÃ©
> dÃ©passÃ©s par les lots intÃ©grÃ©s ci-dessus ; il ne dÃ©finit plus la prochaine
> action. Le P0.3 ci-dessus est la seule proposition active de Codex.

### 1. Validation et consolidation des lots locaux

**Objectif :** relire les changements non publiÃ©s (workers, cron, Sentry, CSP
et packaging), confirmer leurs preuves et sÃ©parer un pÃ©rimÃ¨tre publiable.

**Limites :** prÃ©server les modifications existantes ; pas de commit, push,
dÃ©ploiement, migration distante ou changement Stripe.

**Preuves :** `git diff --check`, tests adaptÃ©s, typecheck, lint, build, puis
liste prÃ©cise des Ã©carts et risques rÃ©siduels.

### 2. Site public cohÃ©rent avec le packaging

**Objectif :** remplacer les anciennes offres Â« Starter Â», Â« Pronostics
+9 â‚¬/mois Â» et Â« Pass CompÃ©tition 49 â‚¬ Â» par Core / Engagement / Live & Events
/ Full Platform.

**Limites :** rÃ©utiliser `src/lib/plans.ts` ; ne pas dupliquer prix, droits ou
limites ; pas de produit Stripe, Price ID, checkout ou dÃ©ploiement ; conserver
la demande de contact si Stripe n'est pas configurÃ©.

**Preuves :** tests ciblÃ©s, typecheck, lint, build et Ã©carts restants.

### 3. Boucle de preuve de valeur J7 / J14 / J30

**Objectif :** montrer au commerÃ§ant activation, participation, rÃ©tention et
rÃ©sultat commercial observable aprÃ¨s 7, 14 et 30 jours.

**Limites :** Ã©vÃ©nements mesurables avant les messages ; segmentation,
opt-in, dÃ©sinscription, fuseau horaire et consentement ; aucun envoi rÃ©el sans
configuration et accord sÃ©parÃ©s.

**Preuves :** rÃ¨gles de calcul documentÃ©es, tests des segments et cas sans
donnÃ©e, dÃ©monstration ou E2E ciblÃ©.

### 4. Player Hub transversal sans compte obligatoire

**Objectif :** donner au joueur une continuitÃ© entre expÃ©riences : historique
utile, rÃ©compenses et prochaines actions, sans compte imposÃ©.

**Limites :** identitÃ© lÃ©gÃ¨re et rÃ©vocable, isolation stricte par organisation,
aucune donnÃ©e personnelle inutile, compatibilitÃ© dÃ©montrÃ©e avec les parcours
publics existants.

**Preuves :** scÃ©nario nouveau joueur/joueur rÃ©current, contrÃ´les multi-tenant
et RLS si la base Ã©volue, tests de parcours et revue sÃ©curitÃ©.

### 5. Simulateur ROI et dÃ©mo interactive

**Objectif :** faire comprendre l'offre Ã  un prospect et estimer un bÃ©nÃ©fice
plausible avant contact.

**Limites :** hypothÃ¨ses explicites, rÃ©sultats prÃ©sentÃ©s comme estimations,
aucun chiffre inventÃ© ni promesse de revenu, sans compte ni appel Stripe.

**Preuves :** calculs testÃ©s, cas limites, accessibilitÃ© clavier/mobile et
mesure analytique non intrusive.

### 6. Marketing verticalisÃ© et amÃ©liorations techniques structurantes

**Objectif :** crÃ©er des parcours par secteur sans dupliquer le code, tout en
traitant les risques techniques avant l'Ã©largissement de l'offre.

**Limites :** composants et donnÃ©es partagÃ©s ; pas de copier-coller de pages ;
prioriser workers, routes publiques, webhooks, sÃ©curitÃ© Stripe et performance ;
toute mutation distante reste soumise Ã  autorisation sÃ©parÃ©e.

**Preuves :** architecture de contenu rÃ©utilisable, tests de rendu et liens,
contrÃ´les de sÃ©curitÃ©, validation Docker/WSL et rapport des risques ouverts.

## BloquÃ© / dÃ©cision utilisateur nÃ©cessaire

- CrÃ©ation des produits et prix Stripe, et renseignement des
  `STRIPE_PRICE_ID_CORE`, `STRIPE_PRICE_ID_ENGAGEMENT`,
  `STRIPE_PRICE_ID_LIVE`, `STRIPE_PRICE_ID_FULL` : nÃ©cessite une autorisation
  explicite et les dÃ©cisions commerciales finales.
- Commit, push, fusion, migration distante et dÃ©ploiement : nÃ©cessitent une
  autorisation explicite distincte.

## PrÃ©parations propriÃ©taire â€” sans nouveau chantier de code

- Confirmer le packaging commercial final : prix, pÃ©riode d'essai, TVA,
  politique de changement d'offre et marchÃ© de lancement. Cette dÃ©cision est
  nÃ©cessaire avant de crÃ©er les produits et prix Stripe.
- PrÃ©parer l'identitÃ© lÃ©gale et opÃ©rationnelle : raison sociale, adresse,
  contact support, domaine d'envoi et personne responsable des donnÃ©es. Ne pas
  inventer ces informations dans le produit.
- DÃ©finir une premiÃ¨re cohorte bÃªta et son objectif mesurable : type de
  commerce, nombre de commerces, durÃ©e, activation visÃ©e et signal de valeur.
- Valider les indicateurs de rÃ©ussite J7/J14/J30 avec les futurs commerces :
  ils doivent correspondre Ã  leur rÃ©alitÃ© mÃ©tier, pas seulement Ã  des mÃ©triques
  techniques.
- PrÃ©parer les accÃ¨s administratifs nÃ©cessaires uniquement quand une mise en
  ligne sera dÃ©cidÃ©e : Stripe, domaine/email, Vercel, Supabase et analytics.
  Aucun accÃ¨s, secret ou changement distant n'est demandÃ© Ã  ce stade.
