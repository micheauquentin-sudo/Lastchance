# Roadmap â€” Lastchance

## V1 â€” MVP SaaS (âœ… livrÃ©e)
**Objectif** : MVP robuste testable chez un premier commerce rÃ©el.

- [x] Architecture propre (Next.js App Router + Server Actions)
- [x] Base de donnÃ©es multi-tenant + RLS (testÃ©e sur PostgreSQL 16)
- [x] Authentification Supabase + onboarding organisation
- [x] Dashboard commerÃ§ant (campagnes, roue, lots, stats)
- [x] Roue entiÃ¨rement configurable (poids, stocks, couleurs, perdants)
- [x] Parcours joueur complet (spin serveur â†’ formulaire RGPD â†’ code)
- [x] GÃ©nÃ©ration de QR codes (PNG imprimables, compteur de scans)
- [x] Participations : validation des gains, export CSV
- [x] Stripe : checkout, portail, webhook, gating automatique
- [x] Emails de gain (Resend) + analytics (PostHog)
- [x] PrÃªt pour dÃ©ploiement Vercel (guide dans README)

## V1 polish â€” PrÃ©paration bÃªta privÃ©e (âœ… 2026-07-10)
**Objectif** : lisser l'usage quotidien du commerÃ§ant avant le pilote.

- [x] Participations : filtre Â« Ã€ valider / RÃ©cupÃ©rÃ©s Â» + recherche par
      code, prÃ©nom ou email (terme neutralisÃ© contre l'injection PostgREST)
- [x] Dashboard : carte Â« Gains Ã  valider Â» cliquable + taux de gagnants
- [x] Liste des campagnes : tours jouÃ©s, gains et Â« Ã  valider Â» par campagne
- [x] QR codes : affiche A4 imprimable (`/poster/[id]`, route protÃ©gÃ©e)
- [x] Tests unitaires ajoutÃ©s (`utils.test.ts` : sanitisation de recherche,
      slugify, codes de gain)

## V1.1 â€” Branding & personnalisation (âœ… 2026-07-10)
**Objectif** : que la roue et l'affiche ressemblent au commerce, pas au SaaS.

- [x] Logo d'Ã©tablissement (upload dans RÃ©glages, Supabase Storage,
      affichÃ© sur /play aprÃ¨s le scan et sur l'affiche)
- [x] Personnalisation complÃ¨te de la roue : 6 presets mÃ©langeables
      (Classique, NÃ©on, Luxe, Pastel, Minimal, Festif) + rÃ©glage fin de
      chaque dÃ©tail â€” anneau (5 styles), ampoules (2 couleurs), bordures
      de segments, texte des lots, moyeu (4 styles), pointeur (3 formes),
      7 polices (Google Fonts chargÃ©es Ã  la demande), fond de page,
      dÃ©gradÃ© du bouton, accroche personnalisÃ©e â€” aperÃ§u fidÃ¨le en direct
- [x] Ã‰diteur d'affiche (`/poster/[id]`) : 4 modÃ¨les, fond dÃ©gradÃ©,
      couleurs texte/accent, polices, tous les textes Ã©ditables, taille
      du QR, logo/nom/Ã©tapes affichables â€” sauvegarde par QR code,
      impression A4 (seule l'affiche sort)
- [x] Page Caisse (`/dashboard/redeem`) : validation d'un code en un
      geste, mobile-first, codes normalisÃ©s (Â« gain ab2c Â» â†’ GAIN-AB2C)
- [x] Rate limiting renforcÃ© Upstash (opt-in par env, REST sans
      dÃ©pendance, repli automatique sur le compteur en base)
- [x] Tests E2E Playwright du parcours joueur (skip propre sans env de
      staging ; vÃ©rifie aussi que les probabilitÃ©s ne fuitent pas)

## V1.1.1 â€” Landing marketing premium (âœ… 2026-07-11)
**Objectif** : faire ressentir la valeur du produit dÃ¨s les premiÃ¨res
secondes et inspirer confiance aux commerÃ§ants (rÃ©fÃ©rence : Stripe,
Linear, Vercel). Aucune logique mÃ©tier touchÃ©e.

- [x] Refonte complÃ¨te de la page d'accueil en dark premium : hero avec
      la vraie roue du produit (composant partagÃ© avec /play) en rotation
      lente + cartes flottantes du parcours joueur
- [x] Header sticky avec flou, ancres de sections et menu mobile
      accessible (aria-expanded, Ã‰chap, scroll verrouillÃ©)
- [x] Sections marketing : cibles commerces, Â« Comment Ã§a marche Â» en
      3 Ã©tapes, grille de 6 fonctionnalitÃ©s, aperÃ§u stylisÃ© du dashboard,
      tarif unique (29 â‚¬/mois, 7 jours d'essai), FAQ en accordÃ©ons, CTA
      final
- [x] Animations et micro-interactions : entrÃ©es au chargement,
      rÃ©vÃ©lations au scroll (IntersectionObserver), survols des cartes et
      boutons, balayage lumineux sur le CTA â€” le tout neutralisÃ© par
      `prefers-reduced-motion`
- [x] AccessibilitÃ© : lien d'Ã©vitement, landmarks, focus visibles,
      contrastes AA sur fond sombre ; responsive vÃ©rifiÃ© (390 px â†’ 1440 px,
      captures Playwright)

## V1.1.2 â€” Landing v2, identitÃ© unique en mouvement (âœ… 2026-07-11)
**Objectif** : une identitÃ© unique (pas un template SaaS), sobre,
moderne et fidÃ¨le Ã  la direction artistique du jeu, avec un site
Â« en mouvement Â» quand le visiteur se dÃ©place.

- [x] Direction artistique moderne : noir profond, accents
      violet/fuchsia, Geist en titres, serif italique Fraunces rÃ©servÃ©e
      Ã  l'accent du hero, grain photographique lÃ©ger
- [x] Roue-horizon Ã©purÃ©e qui tourne au rythme du scroll
      (rAF, sans re-render ; vÃ©rifiÃ© : 0Â° â†’ 126Â° aprÃ¨s 900 px)
- [x] Ticker infini des lots, manifeste qui s'allume mot Ã  mot au
      scroll, Ã©tapes Ã©ditoriales Ã  grands numÃ©ros en contour
- [x] Micro-interactions : cartes inclinables, halo dorÃ© suivant le
      curseur (tarifs), CTA magnÃ©tique avec balayage lumineux
- [x] `prefers-reduced-motion` neutralise toutes les animations ;
      accessibilitÃ© et responsive conservÃ©s (captures 390 px / 1440 px)

## V1.1.3 â€” Landing v3, thÃ¨me clair ludique + hero interactif (âœ… 2026-07-11)
**Objectif** : reproduire fidÃ¨lement une maquette de rÃ©fÃ©rence (thÃ¨me
clair chaleureux, roue + tÃ©lÃ©phone), avec une roue qui tourne pour de
vrai et un Ã©cran de tÃ©lÃ©phone interactif.

- [x] Direction artistique claire et chaleureuse : fond dÃ©gradÃ©
      rose/magenta â†’ pÃªche/crÃ¨me, titres Poppins, accent italique
      Fraunces, palette orange/rose/ambre, Ã©tincelles dÃ©coratives
- [x] Hero interactif sur mesure : roue SVG (bezel sombre, ampoules,
      moyeu Â« Last Chance. Â», pointeur dorÃ©) en rotation lente
      permanente + lancer animÃ© jusqu'au lot ; le tÃ©lÃ©phone pilote la
      dÃ©mo (bouton Â« Tourner la roue Â» â†’ Ã©tat en cours â†’ rÃ©sultat avec
      code de gain + bouton Rejouer). QR dÃ©coratif dÃ©terministe.
      VÃ©rifiÃ© Playwright : rotation rÃ©elle + Ã©cran passant au rÃ©sultat,
      cohÃ©rent avec la position de la roue
- [x] Barre de confiance (4 atouts), Â« Comment Ã§a marche Â» en 3 Ã©tapes
      avec flÃ¨ches pointillÃ©es animÃ©es et visuels (prÃ©sentoir QR,
      tÃ©lÃ©phone-roue, carte stats), grille fonctionnalitÃ©s
- [x] AperÃ§u dashboard complet : sidebar, 4 KPI, courbe des
      participations (SVG) + donut Â« Top gains Â» avec lÃ©gende
- [x] Tarif unique, FAQ, CTA final dÃ©gradÃ©, footer â€” tous en thÃ¨me clair
- [x] `prefers-reduced-motion` neutralise roue, Ã©tincelles et flÃ¨ches ;
      accessibilitÃ© (dropdown Ressources, focus, skip link) et responsive
      vÃ©rifiÃ©s (390 px / 1440 px)

## V1.3 â€” Back-office d'administration (âœ… 2026-07-12)
**Objectif** : une console interne rÃ©servÃ©e Ã  l'Ã©quipe LastChance,
totalement sÃ©parÃ©e de l'app commerÃ§ant (design sombre type Stripe /
Vercel / Supabase Studio). Voir [docs/admin-backoffice.md](./admin-backoffice.md).

- [x] 8 modules : Dashboard (MRR/ARR, abonnements, stats), CommerÃ§ants
      (liste + fiche + actions), Support, Stripe, Analytics, Audit Logs,
      Monitoring, ParamÃ¨tres
- [x] RBAC 5 rÃ´les (Super Admin, Admin, Support, Finance, Lecture seule)
      avec matrice de permissions unique et testÃ©e (13 cas)
- [x] SÃ©curitÃ© : tables verrouillÃ©es (RLS sans policy, service role
      only), double barriÃ¨re (session + admin_users actif), garde de
      page + garde d'action, validation zod
- [x] Anti-escalade : rÃ´le â‰¤ le sien, pas d'auto-gestion, dernier
      super_admin protÃ©gÃ© (anti-verrouillage)
- [x] Audit complet des actions sensibles (acteur, cible, avant/aprÃ¨s, IP)
- [x] AmorÃ§age du premier super_admin par fonction SQL dÃ©diÃ©e
- [x] VÃ©rifiÃ© : typecheck, lint, 126 tests, build (routes /admin
      dynamiques), captures desktop + mobile

## V1.4 â€” FidÃ©lisation & diffÃ©renciation (âœ… 2026-07-12)
**Objectif** : fermer la boucle de fidÃ©lisation (la donnÃ©e collectÃ©e sert
enfin Ã  quelque chose), donner une vue relationnelle des clients, mettre
en avant l'absence de review-gating comme argument commercial, et
diversifier la mÃ©canique de jeu. Voir l'analyse concurrentielle qui a
motivÃ© ces choix (comparaison directe avec les solutions du marchÃ©
positionnÃ©es sur Â« avis Google contre roue Â»).

- [x] **Newsletter** â€” `/dashboard/newsletter` : composer + historique
      d'envois, emails par lots (Resend batch API), dÃ©sinscription en un
      clic (jeton HMAC signÃ©, sans expiration, sans session), rate limit
      anti-abus (5 envois/jour/org). Compteur d'abonnÃ©s actifs affichÃ©
      dans Participations avec lien direct.
- [x] **Profil client** â€” `/dashboard/customers` : agrÃ©gat des gains par
      email (RPC `org_customer_profiles`, vÃ©rification d'appartenance
      intÃ©grÃ©e), segments actionnables (Nouveau / FidÃ¨le / Ã€ relancer
      avec lien direct vers la newsletter).
- [x] **Argument anti review-gating** â€” section dÃ©diÃ©e sur la landing
      (Â« Un jeu honnÃªte, pas un piÃ¨ge Ã  avis Â») expliquant le risque rÃ©el
      (rÃ¨gles Google Business Profile) pris par les solutions qui
      conditionnent le gain Ã  un avis. DiffÃ©renciateur dÃ©jÃ  prÃ©sent dans
      le produit, jusqu'ici enterrÃ© en pied de page.
- [x] **Carte Ã  gratter** â€” deuxiÃ¨me mÃ©canique de jeu, entiÃ¨rement
      dÃ©couplÃ©e du tirage serveur (`wheels.game_type`, aucun changement
      au flux anti-triche/claim). Canvas HTML avec grattage tactile/souris
      (composite `destination-out`, rÃ©vÃ©lation auto Ã  50 % grattÃ©) +
      bouton Â« RÃ©vÃ©ler directement Â» pour l'accessibilitÃ©. SÃ©lecteur
      Roue/Carte dans les rÃ©glages de campagne.
- [x] VÃ©rifiÃ© : typecheck, lint, 130 tests, build (nouvelles routes
      dynamiques), geste de grattage simulÃ© et rÃ©vÃ©lation confirmÃ©e
      (Playwright), captures desktop de la landing et des rÃ©glages.

## V1.5 â€” Studio crÃ©atif & Pronostics (âœ… 2026-07-18)

- [x] Preset de roue Kermesse alignÃ© sur la direction artistique du produit.
- [x] Studio QR : huit motifs, quatre styles d'yeux, dÃ©gradÃ©s, logo rÃ©glable,
      banniÃ¨re et export PNG jusqu'Ã  2048 px, avec garde de contraste.
- [x] Ã‰diteur d'affiche libre : calques, glisser-dÃ©poser, redimensionnement,
      rotation, 18 formes, images rognables, 28 polices et quatre modÃ¨les.
- [x] Addon Pronostics : compÃ©titions cataloguÃ©es ou libres, inscription,
      grilles, rÃ©sultats, classement, barÃ¨me et rÃ©compenses.
- [x] Durcissement : Turnstile, PII owner-only, intÃ©gritÃ© multi-tenant,
      fermeture et scoring transactionnels, consentement et purge RGPD.

## V1.6 â€” Pronostics avancÃ© & Automatisations commerÃ§ant (âœ… 2026-07-21)
**Objectif** : faire vivre un championnat en boutique (ligues, Ã©cran TV,
saisie sans friction) et donner au commerÃ§ant des automatismes qui
travaillent pour lui (budget, programmation, stock, cycle de vie client).

- [x] Pronostics â€” saisie rapide des matchs en lot (1 Ã  30, tout-ou-rien,
      duplication de date, erreurs par ligne)
- [x] Pronostics â€” barre de progression Â« X/Y pronostics complÃ©tÃ©s Â»
- [x] Pronostics â€” mode TV plein Ã©cran (`/pronos/[slug]/tv`, polling 45 s,
      rotation de pages, podium ; JSON public top 30 sans PII, cache CDN
      30 s â€” ADR-022)
- [x] Pronostics â€” ligues privÃ©es (crÃ©ation, code d'invitation, quitter,
      classement re-numÃ©rotÃ© 1..n â€” ADR-020, rate limits dÃ©diÃ©s)
- [x] Campagnes â€” programmation automatique (`auto_schedule`, pg_cron SQL
      direct toutes les 10 min selon starts_at/ends_at)
- [x] Campagnes â€” budget de gains avec pause automatique Ã  l'atteinte et
      relance manuelle (ADR-018)
- [x] Lots â€” seuil d'alerte stock + email commerÃ§ant (trigger rÃ©armÃ© au
      restock)
- [x] 3 scÃ©narios cycle de vie client (gain non retirÃ©, inactifs 30/60 j,
      post-retrait) dÃ©dupliquÃ©s par `email_log`, cron quotidien 09:30
- [x] ScÃ©nario anniversaire Ã  double consentement (case dÃ©diÃ©e sous
      l'opt-in marketing, fuseau de l'organisation â€” ADR-019)
- [x] Revue sÃ©curitÃ© passÃ©e (0 critique/Ã©levÃ©) ; finding moyen corrigÃ© :
      garde owner/editor sur `updateCampaignAutomation` et
      `resumeCampaignAfterBudget`

**Suites ouvertes** :
- [ ] Arbitrage produit reengage / scÃ©nario inactive (coexistence assumÃ©e
      avec avertissement UI â€” ADR-021)
- [ ] Minimisation `birth_date` (jour + mois suffiraient â€” ADR-019)
- [ ] Durcissement : ne poser `birth_date` que sur une ligne crÃ©Ã©e par le
      claim (FAIBLE assumÃ©, docs/bugs.md)
- [ ] CI : exÃ©cuter pgTAP (`supabase test db`) et les 73 E2E Playwright
      (non exÃ©cutÃ©s localement, Docker absent â€” `--list` OK)

## V1.7 â€” Chasse au trÃ©sor multi-QR (âœ… 2026-07-22)
**Objectif** : un nouveau module de jeu (comparable Ã  Pronostics) â€” un
parcours de QR codes Ã  travers la boutique ou le quartier, menant Ã  un lot
final retirÃ© en caisse.

- [x] Addon d'organisation `addon_hunts` (miroir d'`addon_pronostics`),
      activÃ© depuis le back-office admin, gating `hasHuntsAccess` (ADR-023)
- [x] Chasse de 2 Ã  10 Ã©tapes, ordre libre ou imposÃ©, fenÃªtre de dates
      optionnelle, indice optionnel rÃ©vÃ©lÃ© aprÃ¨s chaque Ã©tape, dÃ©lai minimal
      optionnel entre scans (anti-partage, sans gÃ©olocalisation â€” ADR-026)
- [x] Parcours joueur `/hunt/[token]` : scan â†’ Â« Valider mon passage Â»
      (POST, anti-prefetch) â†’ tampon + indice â†’ complÃ©tion. IdentitÃ© par
      cookie HTTP-only + hash (miroir contest, aucune PII)
- [x] `record_hunt_scan` atomique sous verrou de chasse : tampon idempotent,
      ordre, dÃ©lai, complÃ©tion + code `CHASSE-â€¦` + stock optionnel dans une
      transaction
- [x] RÃ©compense = lot direct avec code de retrait (pas de roue â€” ADR-023) ;
      email de rappel optionnel Ã  usage unique (ADR-024)
- [x] Caisse unifiÃ©e roue/chasse (`CashierMatch` discriminÃ© par `source`) ;
      remise par RPC dÃ©diÃ©e `redeem_hunt_completion` (atomique, auditÃ©e)
- [x] Ã‰diteur commerÃ§ant (chasse, Ã©tapes, rÃ©ordonnancement, affiches QR par
      Ã©tape), back-office addon, purge RGPD `purge_expired_hunt_players`
- [x] CI : `hunts.test.sql` (pgTAP) + `e2e/hunt.spec.ts` (parcours complet +
      scans axe-core) ajoutÃ©s ; `automation.test.sql` rebranchÃ© au job pgTAP
- [x] Revue sÃ©curitÃ© passÃ©e : 1 Ã‰LEVÃ‰ corrigÃ© (claim email Ã  usage unique),
      1 MOYEN corrigÃ© (rate-limit de scan recalibrÃ© pour IP partagÃ©e â€” ADR-025)

**Suites ouvertes** :
- [ ] Multi-commerÃ§ants partenaires (chasse de quartier, multi-tenant
      croisÃ© â€” reportÃ©, ADR-027)
- [ ] Mini-jeux d'Ã©tape (au-delÃ  du simple tampon)
- [ ] RÃ©compenses intermÃ©diaires (paliers avant le lot final)
- [ ] DÃ©faut `min_scan_interval_seconds` > 0 Ã  l'Ã©tude (ADR-026)

## V1.8 â€” Passeport de fidÃ©litÃ© ludique (âœ… 2026-07-22, GA 2026-07-23)
**Objectif** : un module de fidÃ©lisation (comparable Ã  Pronostics/Chasse) â€” le
client cumule des visites sur un passeport dÃ©matÃ©rialisÃ©, dÃ©bloque des niveaux
et des paliers rÃ©compensÃ©s en boutique. **LivrÃ© en production, qualitÃ© GA.**

- [x] Addon d'organisation `addon_loyalty` (miroir d'`addon_hunts`), activÃ©
      depuis le back-office admin, gating `hasLoyaltyAccess` (ADR-028)
- [x] Cumul de visites â†’ tampon numÃ©rique ; niveaux bronze/argent/or calquÃ©s
      sur le compteur (seuils configurables)
- [x] Deux modes de validation au choix du commerÃ§ant : code tournant type
      TOTP sur Ã©cran comptoir (secret jamais exposÃ©) et validation staff
      owner/editor/cashier en caisse ; cooldown anti-abus (ADR-030)
- [x] Paliers Ã  rÃ©compense MIXTE, tous Ã  STOCK FINI OBLIGATOIRE et palier â‰¥
      visite 2 : lot direct (code `FIDELITE-â€¦` remis en caisse) ou tour de roue
      offert (grant Ã  usage unique â†’ tirage atomique â†’ flux de gain normal, code
      `GAIN-â€¦`) (ADR-028, ADR-029, ADR-031)
- [x] Parcours joueur `/passeport/[programId]` (identitÃ© cookie HTTP-only +
      hash, aucune PII), Ã©cran comptoir, Ã©diteur commerÃ§ant, caisse unifiÃ©e
      (`source: 'loyalty'`), back-office addon, purge RGPD
      `purge_expired_loyalty_members`
- [x] CI : `loyalty.test.sql` (pgTAP) + `e2e/loyalty.spec.ts` (parcours + scan
      axe-core, smoke 404) ; `security_acl.test.sql` Ã©tendu
- [x] Durcissement prÃ©-GA (8 revues sÃ©curitÃ©, 2026-07-22 â†’ 2026-07-23) : jeton
      de check-in signÃ© TTL 3 min en mode staff (au lieu du bearer 180 j
      photographiable), planchers de cooldown durcis en base (staff 300 s,
      rotating `max(2 Ã— pÃ©riode, 300 s)`), verrous Ã©conomiques (stock fini,
      palier â‰¥ 2, bornes du palier spin), retrait des seaux Â« kill-switch Â»
      (ADR-030, ADR-031, ADR-032 â€” dÃ©tail docs/bugs.md)
- [x] Revue sÃ©curitÃ© : verdict GA, 0 finding bloquant ; perte maximale bornÃ©e
      â‰ˆ 150 â‚¬ par les verrous Ã©conomiques

**Suites ouvertes** :
- [ ] Purge de la dette rate-limit `hunt` / `prono` / `spin` (seaux `failClosed`
      sur clÃ© partagÃ©e â€” ADR-032 ; en cours dans un chantier sÃ©parÃ©)
- [ ] SÃ©ries de visites (streak) et bonus d'assiduitÃ©
- [ ] Multiplicateurs / missions heures creuses
- [ ] Collection / badges Ã  dÃ©bloquer
- [ ] Bonus multi-Ã©tablissements (multi-tenant croisÃ© â€” reportÃ© avec ADR-028)

## V1.49 â€” Fonds thÃ©matiques cartoon (âœ… 2026-08-07, branche `chantier/themes-cartoon`, PR #129 fusionnÃ©e, migration `20260917120000`)

> RenumÃ©rotÃ©e V1.48 â†’ V1.49 Ã  la fusion : les PR #128 et #129 sont parties du
> mÃªme `main` et revendiquaient chacune V1.48/ADR-092 ; #128 fusionnÃ©e
> d'abord garde les siens.

**Objectif** : demande propriÃ©taire â€” quand un thÃ¨me est choisi (NoÃ«l,
Saint-Valentinâ€¦), le fond doit suivre : remplacer les lignes fades par des
dÃ©cors cartoon (rennes, tÃªtes de PÃ¨re NoÃ«l, sucres d'orgeâ€¦), sur toutes les
surfaces et aussi pour les pronostics.

**LivrÃ©** :
- **DB** (`20260917120000_themes_saisonniers.sql`) : `contests.theme` (dÃ©faut
  `neutre`, CHECK 6 clÃ©s saisonniÃ¨res â€” `neutre`, `noel`, `saint_valentin`,
  `anniversaire`, `soldes`, `festival` â€” la mÃªme palette que `calendars.theme`,
  jamais deux vocabulaires pour la mÃªme idÃ©e), liste blanche UPDATE des
  pronostics rÃ©Ã©mise en entier avec `theme` (status/rewards toujours exclus),
  CHECK du calendrier Ã©largi Ã  `saint_valentin`. Suite pgTAP dÃ©diÃ©e
  `themes_saisonniers.test.sql` (29 assertions).
- **Backend** : `updateContest` accepte `theme` en **optionnel-prÃ©servant**
  (absent du FormData â‡’ colonne intacte â€” la classe du bug `default_locks_at`
  ne peut pas se reproduire). `src/lib/seasonal-theme.ts` devient la source
  unique de l'enum saisonniÃ¨re (repli neutre en lecture, refus en saisie) ;
  `lib/calendar.ts` la consomme au lieu de sa copie locale. Le contexte public
  `/pronos` expose `theme`, refermÃ© par `asSeasonalTheme`.
- **Frontend** : `ThemeDecor` â€” 16 scÃ¨nes cartoon, 28 motifs (contour encre,
  aplats pastel), 13 emplacements dÃ©terministes (zÃ©ro `Math.random`, zÃ©ro id
  SVG), alpha sous les rayures existantes, animations dans la liste
  `prefers-reduced-motion`, aucun contexte d'empilement. `PlayerPageShell`
  factorise les 4 shells joueur (quiz, calendrier, pronostics, rÃ©cupÃ©ration).
  `/play` gagne le dÃ©cor de son preset sur la branche kermesse (nuit :
  abstention assumÃ©e). Les aperÃ§us Ã©diteurs (calendrier, quiz, roue) montrent
  le mÃªme dÃ©cor que le joueur. Pronostics : sÃ©lecteur 6 vignettes, tokens
  `contest-theme.ts` sur le patron du calendrier, Saint-Valentin restylÃ©e en
  vrai thÃ¨me (trame de cÅ“urs), `/pronos/[slug]/recover` gagne le `<main>` qui
  lui manquait.
- **Durcissement** : `Object.hasOwn` sur les 3 tables de tokens (pronos,
  calendrier, quiz) contre une clÃ© hÃ©ritÃ©e du prototype rendant le repli
  neutre inopÃ©rant (INFO-1 de la revue sÃ©curitÃ©, prÃ©existant sur
  calendrier/quiz, fermÃ© partout).

**Revue sÃ©curitÃ© dÃ©diÃ©e : GO â€” 0 critique/Ã©levÃ©/moyen/faible, 4 INFO** (1
corrigÃ©e avant fusion, 3 en suivi dans `docs/bugs.md` : ordre de dÃ©ploiement
migrationâ†’build, paritÃ© palette SQLâ†”TS non testÃ©e entre les deux, garantie
optionnel-prÃ©servant qui porte sur l'absence et non le vide).

Preuve : typecheck 0, lint 0, **238 fichiers / 3803 tests**, build vert,
migrations:check 121 (tÃªte `20260917120000`), sql:check ok, casts:check ok,
pgTAP **56 fichiers / 3172 assertions** PASS vide+semÃ©e, E2E ciblÃ© (3
projets, pronostics/calendar/quiz/player-win, scans axe) 42 passed / 6
skipped / 0 failed. ADR-093.

**Hors pÃ©rimÃ¨tre assumÃ©** : le quiz garde ses 7 thÃ¨mes d'usage (pas de
saisons, dÃ©cision produit) ; la branche Â« nuit Â» de `/play` reste sans dÃ©cor ;
le mode TV pronostics reste neutre (`theme` non exposÃ© Ã 
`loadContestTvContext`).
## V1.48 â€” Apparence dashboard : clartÃ© et rappels fermables (âœ… 2026-08-07, branche `chantier/apparence-dashboard`, PR #128 fusionnÃ©e `0c018fd`, sans migration)

**Objectif** : demande propriÃ©taire du jour â€” amÃ©liorer l'apparence et la
clartÃ© du dashboard, 7 points, sans toucher Ã  la logique mÃ©tier ni au schÃ©ma.

**LivrÃ©**, en 5 commits :
- **Shell** (`eaf50a2`) â€” le dÃ©bordement horizontal qui frappait les 8 pages
  de modules corrigÃ© Ã  la source : le slot actions de `PageHeader` perdait
  son droit de rÃ©trÃ©cir (`shrink-0` â†’ `min-w-0 max-w-full`), les 8 formulaires
  de crÃ©ation bornÃ©s (`w-full max-w-xl`). Sidebar `lg:overflow-y-auto` (+ div
  interne `lg:min-h-full`) â€” le bouton DÃ©connexion redevient atteignable ;
  `truncate` sur les libellÃ©s de nav. **Rappels fermables** neufs : cookie +
  server action (`src/lib/rappels.ts` pur et testÃ©, `src/actions/rappels.ts`,
  `RappelFermable`), zÃ©ro flash (le layout lit `cookies()` cÃ´tÃ© serveur).
  Fermables : Â« AccÃ¨s offert Â», Â« Essai gratuit Â» (revient chaque jour), le
  Conseiller. Jamais fermables : les 3 bandeaux bloquants (incident de
  paiement, abonnement inactif, essai terminÃ©). ClÃ©s versionnÃ©es et
  org-scopÃ©es.
- **DÃ©tail campagne** (`dabf9ec`) â€” 6 blocs secondaires repliables via
  `CarteRepliable` (composant client, bouton `aria-expanded` â€” pas
  `<details>` : Chromium retire le rÃ´le heading aux descendants d'un
  `<summary>`, les locators E2E en auraient souffert). QR embarquÃ©
  directement sur la page du jeu (vignettes, crÃ©ation prÃ©-remplie via
  `campagneFigee`, suppression, les 3 actions revalident la page) : fin de
  l'aller-retour vers l'onglet QR Codes ; l'Ã©tape Â« La vÃ©rification Â» de
  l'Atelier pointe dÃ©sormais `/dashboard/campaigns/<id>#qr`.
- **Titres** (`18dddd1`) â€” la `Card` partagÃ©e impose
  `[&>h2]:text-lg [&>h2]:font-black` en un point unique, 67 titres alignÃ©s
  sur le style atelier (+ 10 h2 imbriquÃ©s corrigÃ©s Ã  la main). Le rouge
  Â« Zone dangereuse Â» n'est pas touchÃ©.
- **Accueil dÃ©doublonnÃ©** (`4b77353`) â€” un mÃªme compteur s'Ã©crivait jusqu'Ã 
  3-4 fois (tuile + tÃ¢che + conseil + hero). Les 4 rÃ¨gles opÃ©rationnelles du
  Conseiller redondantes avec des tuiles (op-gains, op-stock, op-qr,
  op-brouillons) supprimÃ©es. Conseiller fermable (clÃ© par condensÃ© des
  conseils affichÃ©s, aucune PII).
- **Revue sÃ©curitÃ© fermÃ©e avant PR** (`1cb13a5`) â€” GO, 0 critique/Ã©levÃ©,
  2 MOYEN + 4 INFO ; corrigÃ©s avant PR : liste blanche de prÃ©fixes de clÃ©s de
  cookie (invariant Â« bandeau bloquant jamais fermable Â» tenu
  mÃ©caniquement), garde de rÃ´le sur les 3 actions QR mutantes, cookie bornÃ©
  au path `/dashboard`, purge au logout, clÃ©s normalisÃ©es. DocumentÃ©s sans
  action : ombrage de cookie (nÃ©cessite XSS, gain nul), pas de rate-limit
  (conforme au pattern des actions dashboard). Nouveau
  `src/actions/qr-codes.test.ts` (14 tests).

**Preuves** (campagne locale complÃ¨te ; CI pas encore jouÃ©e au moment de
l'Ã©criture â€” la PR la jouera) : typecheck 0 ; lint 0 ; Vitest **237 fichiers
/ 3806 tests** verts ; migrations:check / sql:check / casts:check ok ; build
vert (46 pages). E2E ciblÃ© WSL (Supabase reset+seedÃ©, build rÃ©el) sur
dashboard-home, referral, wheel-wizard, campaign-templates : 35 passed /
1 skipped / 1 failed â€” l'unique rouge (`cashier : /dashboard redirige vers
la caisse`, mobile-safari) est un flake WebKit prÃ©existant, confirmÃ© par
rejeu isolÃ© Ã—3 vert (7/7). Aucune migration.

**Reste ouvert** (voir `docs/bugs.md`) : prÃ©fÃ©rence de rappel par navigateur
et non par utilisateur (bornÃ©e par la purge au logout) ; l'ancien cookie
posÃ© en path `/` chez les premiers utilisateurs survit jusqu'Ã 
expiration/logout ; `quiz-editor.tsx:836` et `wheel-style-editor.tsx:199`
restÃ©s Ã  l'ancien style de titre (rÃ©servÃ©s au chantier thÃ¨mes) ; Ã©tat de
repli des cartes non persistÃ© (perdu Ã  la navigation). Prochain chantier
annoncÃ© : fonds thÃ©matiques cartoon par thÃ¨me, en prÃ©paration, PR sÃ©parÃ©e.

## V1.47 â€” L'Atelier partout : extension aux 7 modules de crÃ©ation (âœ… 2026-08-07, branche `chantier/atelier-modules`, PR #127, sans migration)

**Objectif** : demande propriÃ©taire â€” Â« fais l'extension du modÃ¨le atelier
aux autres modules de crÃ©ation Â», aprÃ¨s fusion de V1.46. GÃ©nÃ©raliser le
patron des deux visages livrÃ© sur la roue (V1.46) aux 7 modules restants :
quiz, calendrier de l'Avent, chasse au trÃ©sor, passeport de fidÃ©litÃ©,
jackpot collectif, Ã©vÃ©nement live, pronostics.

**LivrÃ©** : chaque route dÃ©tail (`/dashboard/<module>/[id]`) a dÃ©sormais deux
visages â€” URL nue = vue **suivi** (Carte de l'Aventure, statut, QR/stats/
classement, relance, porte Â« Ouvrir l'atelier Â») ; `?etape=` = **atelier**
une carte Ã  la fois, avec stepper Kermesse. Les primitives gÃ©nÃ©riques
(`atelier-etapes.ts`, `AtelierStepper`, `AtelierNavigationEtape`) sont
extraites de la roue V1.46 et rÃ©utilisÃ©es sans changer son comportement
(`e2e/wheel-wizard.spec.ts` reste vert sans modification). ZÃ©ro migration,
zÃ©ro nouvelle action serveur : chaque Ã©tape poste une action existante
complÃ¨te ; les 5 cartes RÃ©glages monolithiques (quiz, calendrier, chasse,
fidÃ©litÃ©, jackpot) restent des Ã©tapes indivisibles.

DÃ©coupage par module : quiz 4 Ã©tapes (le tirage dÃ©finitif sort du fil vers
le suivi) Â· calendrier 3 (la vÃ©rification nomme et lie la case fautive
`#case-N`) Â· chasse 4 Â· fidÃ©litÃ© 4 Â· jackpot 3 (stepper adaptatif 2â†”3 selon
le mode de validation ; Ã©cran comptoir conditionnÃ© au mode qui le produit) Â·
Ã©vÃ©nement live 4 (carte Sessions coupÃ©e prÃ©parer/suivre) Â· pronostics 6 (vue
nue prÃ©servant classement, pagination, clÃ´ture et palmarÃ¨s, Ã©pinglÃ©s par les
specs E2E existantes).

**Une seule vÃ©ritÃ© de publication** : les prÃ©conditions privÃ©es des actions
(`activationBlocker` de quiz.ts, calendar.ts, jackpot.ts, et les blocs
inline de hunts.ts, loyalty.ts, events.ts) sont extraites en modules purs
testÃ©s sous `src/lib/activation/` (7 modules + `controle.ts` partagÃ©),
consommÃ©s Ã  la fois par l'action serveur et par l'Ã©tape Â« La vÃ©rification Â»
â€” pronostics n'avait rien cÃ´tÃ© serveur (championnat vide publiable), son
Ã©tape de vÃ©rification raconte tout cÃ´tÃ© Ã©cran.

**Bugs vivants corrigÃ©s au passage** : Â« Enregistrer l'Ã©vÃ©nement Â» des
pronostics effaÃ§ait `default_locks_at` dÃ¨s qu'on ne touchait pas la date
(hidden vide â†’ RPC sans condition), dÃ©sormais prÃ©-rempli et prouvÃ© par un
bouton grisÃ© sur no-op ; cinq 404 injustifiÃ©s sur des pages dÃ©tail refusant
l'accÃ¨s sur le droit payÃ© alors que le brouillon est gratuit, corrigÃ©s par
`capacitesDuModule` + `ModuleCapabilityNotice` ; deux ancres `#reglages`
menteuses (chasse â†’ Ã‰tapes, fidÃ©litÃ© â†’ Paliers) ; l'Ã©cran comptoir jackpot
affichÃ© dans un mode oÃ¹ il ne produit rien.

**Nouvelle spec** `e2e/atelier-modules.spec.ts` (19 tests, premiers E2E et
premiers scans axe de ces 7 pages) a dÃ©busquÃ© et fait fermer, sur trois
tours de CI, des violations de contraste prÃ©existantes (liens retour
zinc-500 sur crÃ¨me, liens orange bruts des affiches et cartes de commande â€”
la dette Â« orange survolable Â» de V1.45 pelÃ©e sur ces surfaces â€”, indices
des tuiles sÃ©lectionnÃ©es) et un invariant dÃ©couvert au passage : une case de
calendrier ne peut pas devenir invalide par Ã©dition, le serveur la refuse.

**CI complÃ¨te VERTE sur `93319ea`** (run 31188136154). Revue sÃ©curitÃ©
dÃ©diÃ©e : GO, 0 critique/Ã©levÃ©/moyen â€” l'Ã©largissement d'accÃ¨s ne change que
Â« qui voit sa propre donnÃ©e Â», la publication reste verrouillÃ©e en base via
`assert_module_publish_allowed`, 2 INFO corrigÃ©es avant fusion, 2 INFO en
suivi (`docs/bugs.md`). Preuve : typecheck 0, lint 0, casts:check 0,
migrations:check 120 (aucun SQL), sql:check ok, **235 fichiers / 3775
tests**, build vert. ADR-091.

**Reste ouvert** (`docs/bugs.md`) : schÃ©mas monolithiques non assouplis
(jackpot 14 champs = une seule Ã©tape faute de partiel) ; garde de
publication EN BASE toujours absente, pronostics en tÃªte (rien cÃ´tÃ©
serveur) ; les 3 formulaires `updateContest` non fusionnÃ©s ; questions de
pronostics INSERT-only ; donnÃ©es de suivi quiz pauvres (leaderboard non
lu) ; `createLoyaltyOrderCodes` sans garde de module propre (impact nul,
jetons inertes sur brouillon) ; PR #127 en attente d'une dÃ©cision
propriÃ©taire.

## V1.46 â€” L'Atelier du jeu (âœ… 2026-08-07, branche `chantier/assistant-creation`, PR #126, sans migration)

**Objectif** : demande propriÃ©taire â€” un accompagnement de crÃ©ation en
Ã©tapes, guidÃ© et dÃ©terministe, sans IA (le retrait de l'assistant payant de
V1.44 rÃ©affirmÃ©). Suite directe de la clÃ´ture de V1.45.

**Diagnostic prÃ©alable** (5 explorateurs) sur `/dashboard/campaigns/[id]/wheel` :
102 contrÃ´les interactifs simultanÃ©s, 6 actions d'Ã©criture rÃ©parties sur 12
boutons Enregistrer sans Ã©tat global, Â« Ouvrir aux joueurs Â» sans
prÃ©condition mÃ©tier (une campagne sans lot tirable pouvait Ãªtre publiÃ©e), 13
mÃ©caniques sur 15 recevant des rÃ©glages de roue sans effet visible, aucune
spec E2E ni scan axe sur cette page.

**LivrÃ©** : la page devient l'Atelier â€” 5 Ã©tapes nommÃ©es (Le jeu / Les lots /
L'habillage / Le crÃ©neau / La vÃ©rification) librement navigables par
`?etape=` sur la MÃŠME route (les 6 `revalidatePath` et tous les liens
existants restent valides), `?wheel=` multi-roues prÃ©servÃ©. ZÃ©ro nouvelle
action serveur, zÃ©ro migration : chaque Ã©tape poste une sauvegarde EXISTANTE
complÃ¨te (`updateWheel`, `addPrize`/`updatePrize`/`deletePrize`,
`updateWheelStyle`, `updateWheelSchedule`) â€” jamais un champ d'une autre
Ã©tape repostÃ© en hidden. Ã‰tape Jeu : radiogroup en deux familles honnÃªtes
(Â« Le hasard dÃ©cide Â» / Â« Le client joue son gain Â», Ã©chec = tirage perdant),
Â« IllimitÃ© Â» dÃ©sactivÃ© sur les jeux Ã  secret. Ã‰tape VÃ©rification : checklist
pure testÃ©e (20 tests) â€” lot gagnant tirable au miroir de
`perform_atomic_spin`, poids total, QR existant, fenÃªtre via
`campaignWindowState` importÃ© â€” chaque manque pointe son Ã©tape, le CTA mÃ¨ne
au seul endroit qui publie (`#statut`) ; la publication reste hors de
l'Atelier. Catalogue des 15 mÃ©caniques et calcul `partSur10` extraits en
modules purs testÃ©s, rÃ©sorbant 3 copies divergentes. Couture :
`createCampaign` atterrit dÃ©sormais dans l'Atelier ; `applyCampaignTemplate`
garde le dÃ©tail.

**Nouvelle spec** `e2e/wheel-wizard.spec.ts` (8 tests, premier E2E et premier
scan axe de cette page) a dÃ©busquÃ© 13 violations d'accessibilitÃ© RÃ‰ELLES
prÃ©existantes (contrastes zinc-400, selects/case/curseur sans nom
accessible), corrigÃ©es Ã  la racine.

**CI complÃ¨te VERTE sur `0faa05a`** (run 31167771881 : E2E 3 navigateurs dont
la nouvelle spec, pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build, audit).
Revue sÃ©curitÃ© dÃ©diÃ©e jugÃ©e non requise (aucune migration, route API, auth,
RLS, webhook ni token touchÃ©s â€” seule la cible d'un redirect interne change).
Preuve : typecheck 0, lint 0, **225 fichiers / 3654 tests**, build vert.
ADR-090.

**Reste ouvert** (`docs/bugs.md`) : prÃ©conditions de publication en base Ã 
arbitrer (`set_campaign_status` sans garde mÃ©tier â€” l'Atelier ne protÃ¨ge que
l'Ã©cran) ; `prizes.is_active` Ã©crit par aucune action ; rÃ©ordonnancement des
segments impossible ; quota brouillon absent du chemin
`applyCampaignTemplate` ; PR #126 en attente d'une dÃ©cision propriÃ©taire.

## V1.45 â€” Refonte clartÃ© espace commerÃ§ant (âœ… 2026-08-07, branche `chantier/clarte-commercant`, PR #125, sans migration)

**Objectif** : demande directe du propriÃ©taire â€” l'espace commerÃ§ant beaucoup
plus clair, plus ludique, plus simple ; le commerÃ§ant doit savoir immÃ©diatement
oÃ¹ il est et quoi faire ; les Ã©tapes doivent Ãªtre prÃ©cises ; finir avec les
Â« cases dans tous les sens Â».

**Cartographie prÃ©alable** (7 explorateurs parallÃ¨les, un par sous-systÃ¨me) a
chiffrÃ© le problÃ¨me : ~31 rectangles bordÃ©s pour un nouveau propriÃ©taire sur
`/dashboard`, Â« gains Ã  remettre Â» rÃ©pÃ©tÃ© 5 fois sur le mÃªme Ã©cran avec
**deux calculs diffÃ©rents**, menu Ã  plat de 11 Ã  18 entrÃ©es selon le rÃ´le,
aucun wizard dans tout le dÃ©pÃ´t, le bouton Â« Continuer Â» de la Carte de
l'Aventure rechargeant simplement la page courante, et Â« Bravo, votre
animation est prÃªte Ã  Ãªtre partagÃ©e ! Â» affichÃ© sur une campagne **en pause**.

**Lot A â€” La Vue d'ensemble raconte une histoire** (`/dashboard`). Nouveau
hero **Â« Votre prochaine action Â»** (`src/components/dashboard/prochaine-action.tsx`
+ `-state.ts` testÃ©) qui absorbe l'ancienne checklist d'onboarding â€” sept
prioritÃ©s en cascade, du dÃ©marrage incomplet Ã  Â« Tout roule Â», chaque lien
validÃ© par `lienSelonRole` avant d'Ãªtre proposÃ©. Fusion du Centre d'animation
et du Tableau d'Ã©quipe en une seule section Â« OÃ¹ en sont vos animations Â» (la
tuile doublon Â« VÃ©rifier les participations Ã  valider Â» supprimÃ©e, les
actions faites repliÃ©es en Â« N dÃ©jÃ  faites âœ“ Â»). Conseiller resserrÃ© de 8 Ã 
4 conseils maximum, sans doublon avec le hero. Â« Vos rÃ©sultats Â» dÃ©sormais
stable en permanence (fini l'Ã©cran qui change de forme au premier Ã©vÃ©nement
mesurÃ©), dÃ©tail analytique repliÃ© sous un `<details>` en franÃ§ais de commerce
(Â« Personnes ayant vu un jeu Â», Â« Parties commencÃ©es Â»â€¦ â€” plus de Â« vues
qualifiÃ©es Â» ni de Â« rÃ©demption Â» Ã  l'Ã©cran). Anti-abus rÃ©duit Ã  une ligne
discrÃ¨te.

**Lot B â€” S'orienter**. Menu (`nav.tsx`) regroupÃ© en 4 zones Ã  titres de
section : Au quotidien, Vos animations, Outils, Gestion. Nouveau
`src/components/ui/page-header.tsx` (surtitre/titre/sous-titre/retour/actions,
style Kermesse) posÃ© sur les pages liste, avec un h1 alignÃ© sur le libellÃ© du
menu. **Correctif de fond en route** : `layout.tsx` n'appelait
`activeExperienceKinds(organization)` sans lui passer `hasCompAccess` â€” un
commerÃ§ant en accÃ¨s offert voyait le bandeau Â« AccÃ¨s offert ðŸŽ Â» lui annoncer
des modules que le menu masquait dans le mÃªme temps.

**Lot C â€” Le pas-Ã -pas devient exact**. `experience-lifecycle.ts` distingue
enfin une animation Â« prÃªte Â» (paused/scheduled) d'une animation rÃ©ellement
ouverte : plus de Â« Bravo, prÃªte Ã  Ãªtre partagÃ©e ! Â» sur une campagne en
pause (bug prouvÃ©), plus de Â« Continuer : ClÃ´turÃ©e Â». `StatusBadge` unique
(`src/components/ui/status-badge.tsx`) pour cinq Ã©tats partout identiques
(Brouillon / ProgrammÃ©e / En pause / Ouverte aux joueurs / ClÃ´turÃ©e) et un
vocabulaire de verbes unifiÃ© (Â« Ouvrir aux joueurs Â», Â« Mettre en pause Â»,
Â« ClÃ´turer Â», Â« Repartir de cette formule Â»). Ancres `#reglages` / `#statut`
/ `#suivi` / `#relance` sur les 8 pages dÃ©tail : le bouton Â« Continuer Â» ne
recharge plus jamais la page courante. La carte de statut (avec le bouton de
publication) remonte juste sous la Carte de l'Aventure. 6 InfoBulles ajoutÃ©es
sur `wheel-settings.tsx` et `prize-editor.tsx`, dont le poids expliquÃ© en
clair (Â« â‰ˆ N clients sur 10 gagnent Â»).

**RÃ©paration CI E2E** (4 commits aprÃ¨s le lot C) : locators ambigus corrigÃ©s
par des listes nommÃ©es (`aria-label="RepÃ¨res d'animation"`), et surtout un
nouveau **token de contraste `--color-k-orange-text: #b45309`** (4.66:1 sur
fond crÃ¨me, 5.02:1 sur fond blanc, calculÃ©s) appliquÃ© aux sur-titres, aux
marqueurs Â« â†’ Â» sur case jaune et aux titres de groupe du menu â€” le scan axe
(`expectNoA11yViolations`) ajoutÃ© au test owner de `dashboard-home` a attrapÃ©
de **vraies** violations de contraste en production, corrigÃ©es Ã  la racine
par le token plutÃ´t qu'au cas par cas.

**Revue sÃ©curitÃ© dÃ©diÃ©e : GO, 0 critique/Ã©levÃ©/moyen** ; 2 findings INFO
corrigÃ©s avant fusion, 2 INFO laissÃ©s en suivi (docs/bugs.md â€” pages en
lecture seule sans redirect de rÃ´le, liens orange sous 4.5:1 hors pages
scannÃ©es). Aucune migration, aucune route API, aucune action serveur
touchÃ©e par ce chantier.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, `migrations:check` 120
(aucun SQL ajoutÃ©, `EXPECTED_MIGRATION` inchangÃ©e), `sql:check` ok,
**222 fichiers / 3626 tests**, build vert. **CI complÃ¨te VERTE sur `f0ba41d`**
(run 31158677255 : E2E Chromium+WebKit 3 projets, pgTAP/RLS, CodeQL,
typecheck/lint/Vitest/build, audit npm, site vitrine).

**LivrÃ©** : PR #125 ouverte vers `main`, **fusion en attente d'une dÃ©cision du
propriÃ©taire** â€” pas un blocage technique.

**Hors pÃ©rimÃ¨tre, consignÃ© pour un chantier suivant** : vrai wizard de
crÃ©ation multi-Ã©crans (page de configuration Ã  ~70 contrÃ´les), boutons
Â« Enregistrer Â» multiples sans Ã©tat global, textes d'emails de modÃ¨les jamais
affichÃ©s aprÃ¨s application, dates de modÃ¨le dÃ©marrant Ã  l'application plutÃ´t
qu'Ã  l'activation, QR non gÃ©nÃ©rÃ© automatiquement Ã  la crÃ©ation d'une
campagne, parrainage invisible dans la navigation, unification des 9 cartes
de caisse, gÃ©nÃ©ralisation de `PageHeader` aux pages dÃ©tail.

## V1.44 â€” Le conseiller commerÃ§ant, gratuit et dÃ©terministe (remplace l'assistant IA payant) (âœ… 2026-08-06, branche `chantier/conseiller-gratuit`, sans migration)

**Objectif** : le lot prÃ©cÃ©dent avait livrÃ© un assistant de crÃ©ation propulsÃ©
par l'API Anthropic, facturÃ© au jeton. Le propriÃ©taire ne voulait pas d'IA
facturÃ©e : il voulait un accompagnement simple, dans le code, gratuit. Le lot
retire l'assistant IA payant et le remplace par un conseiller commerÃ§ant
dÃ©terministe â€” de simples rÃ¨gles sur des donnÃ©es dÃ©jÃ  chargÃ©es, aucun appel
externe, aucune clÃ©, aucun coÃ»t.

**Retrait.** L'assistant IA payant du lot D (#123 â€” `ia-provider`,
`ia-assistant`, `ANTHROPIC_API_KEY`, `iaSuggestion`, et la 3áµ‰ source
`blueprint` d'`applyCampaignTemplate`) est revertÃ© intÃ©gralement (commit
`be7fdef`) : plus aucune trace dans le code, seulement dans l'historique et
dans `docs/journal.md`.

**Le conseiller, gratuit.** `src/lib/conseiller-commercant.ts` expose une
fonction pure `construireConseils({ role, compteurs, activeKinds })` qui
projette l'Ã©tat dÃ©jÃ  chargÃ© du dashboard (les compteurs du Centre d'animation
+ le catalogue des modules et les kinds actifs) en une liste de conseils.
Ton **neutre et informatif, jamais commercial** (dÃ©cision explicite du
propriÃ©taire) : le conseiller signale, il ne survend pas. **Quatre catÃ©gories**,
triÃ©es par prioritÃ© et bornÃ©es Ã  8 au total pour ne pas noyer le
commerÃ§ant :
- `activite` â€” **la lecture croisÃ©e que les compteurs ne donnent pas**,
  prioritÃ©s 130 â†’ 115 : Â« N animations en brouillon, aucune ouverte aux
  joueurs. Â», Â« Aucune animation n'est ouverte aux joueurs. Â», Â« N vues
  qualifiÃ©es sur 30 jours, aucune partie lancÃ©e. Â», Â« N parties lancÃ©es sur
  30 jours, aucune terminÃ©e. Â», Â« N lots gagnÃ©s Ã  la roue, aucune coordonnÃ©e
  client enregistrÃ©e. Â» Ces rÃ¨gles lisent `org_dashboard_summary` et
  `org_experience_analytics`, **dÃ©jÃ  chargÃ©es par la page** â€” aucune requÃªte
  ajoutÃ©e. Le commerÃ§ant voit ses chiffres partout ; personne ne lui disait
  ce qu'ils signifient **ensemble**.
- `operationnel` â€” gains Ã  remettre, lots en stock faible, QR jamais
  scannÃ©s, brouillons Ã  terminer ; comptes exacts, prioritÃ©s 100 â†’ 70.
- `module` â€” Â« Module <label> disponible (objectif : <objective>). Â» pour
  chaque module du catalogue non encore actif.
- `decouverte` â€” toujours prÃ©sent, renvoie vers `/dashboard/discover`.

**Le conseiller ne rÃ©pÃ¨te jamais un Ã©cran voisin**, et c'est testÃ© : un filet
vÃ©rifie qu'aucune phrase ne parle d'abonnement, d'essai ou des six Ã©tapes de
l'`OnboardingChecklist` â€” le layout et la checklist les portent dÃ©jÃ , dix
centimÃ¨tres plus haut. Deux rÃ¨gles se suppriment mutuellement (une lecture
riche remplace le compteur brut) plutÃ´t que de dire deux fois Â« 2 brouillons Â».

**Une rÃ¨gle proposÃ©e a Ã©tÃ© Ã©cartÃ©e sur preuve** : Â« expÃ©rience publiÃ©e mais
sans aucune vue Â» est indÃ©tectable â€” le `per_experience` d'
`org_experience_analytics` groupe sur les lignes d'`experience_events`, donc
une expÃ©rience sans le moindre Ã©vÃ©nement est **absente**, pas Ã  zÃ©ro. La rÃ¨gle
aurait accusÃ© la mauvaise expÃ©rience.

Chaque `href` passe par `lienSelonRole` : un lien rÃ©servÃ© au propriÃ©taire
(le registre des participations) disparaÃ®t pour un Ã©diteur, la phrase reste.
Un caissier reÃ§oit une liste vide.

**ZÃ©ro coÃ»t, zÃ©ro RPC en plus.** `page.tsx` charge `chargerCentreAnimation`
une seule fois pour l'AnimationCenter et rÃ©utilise directement ses
compteurs pour appeler `construireConseils` â€” pas de seconde RPC. Correction
nÃ©e de la revue sÃ©curitÃ© : un premier wrapper `chargerConseils` relanÃ§ait la
RPC ; devenu sans appelant aprÃ¨s ce correctif, il a Ã©tÃ© retirÃ© (commit
`66cdd31`).

**LivrÃ©** : `src/lib/conseiller-commercant.ts` (fonction pure),
`src/components/dashboard/conseiller-panel.tsx` (panneau montÃ© sur
`/dashboard`, sous le Centre d'animation). Aucune migration, aucun SQL,
aucun appel rÃ©seau.

**Revue sÃ©curitÃ© (lecture seule)** : GO, 0 critique/Ã©levÃ©/moyen. Le retrait
de l'IA est prouvÃ© sans rÃ©sidu, le conseiller ne lit que les donnÃ©es de
l'organisation de session (RPC gardÃ©e par `is_org_editor`), aucun secret,
hrefs filtrÃ©s par rÃ´le, texte Ã©chappÃ© par React. Le seul finding (perf, RPC
en double) a Ã©tÃ© corrigÃ© avant fusion.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, `migrations:check` 120
(aucun SQL ajoutÃ©), `sql:check` ok, **220 fichiers / 3587 tests**, build vert.

## V1.43 â€” Passeport post-jeu et QR de commande unique (âœ… 2026-08-06, branche `chantier/passeport-post-jeu`, migrations `20260915120000` et `20260916120000`)

**Objectif** : point 4 de l'ordre impÃ©ratif du cahier (Â§9.4) â€” Passeport de
fidÃ©litÃ© post-jeu et QR de commande unique (Â§7 du cahier).

**C1 â€” Passeport post-jeu.** AprÃ¨s un jeu â€” gagnÃ© **et** perdu, le cahier ne
distingue pas et le perdant est celui qu'on veut retenir â€” une carte propose
de crÃ©er/continuer un Passeport de fidÃ©litÃ©. Elle est strictement
navigationnelle : un lien vers `/passeport/<programId>`, jamais de tampon
(Â« un lien partagÃ© ne tamponne jamais Â» est vrai par construction). Action
publique `invitationPasseport({organizationId})`, calquÃ©e sur
`getPlayerProgression` â€” lecture unique bornÃ©e, anti-oracle (org inconnue â‰¡
org sans programme â‰¡ module fermÃ©, mÃªme `null` dans les trois cas), sortie au
plus `{programId, programName}`, jamais de secret. Composant
`ProposerPasseport` montÃ© sur 8 ancrages (7 modules â€” roue/RedeemCodeScreen,
quiz, chasse, calendrier, jackpot, Ã©vÃ©nement, pronostics â€” plus les 13 jeux
de rÃ©vÃ©lation via la plomberie `organizationId`), garde un-exemplaire-par-page
(un filleul gagnant voyait la carte deux fois). Le parrainage reste au gain
seul, sans Ã©cran de fin distinct.

**C2 â€” QR de commande unique.** Livraison/e-commerce : une carte/QR/code
**unique par commande** crÃ©e/continue le Passeport et ajoute un tampon une
seule fois ; un code gÃ©nÃ©rique reste Ã  zÃ©ro tampon. Migration
`20260915120000` : table `loyalty_order_codes` (jeton
`^[A-Za-z0-9-]{8,64}$`, copiÃ© de `hunt_steps`, RLS `is_org_editor`/
`is_org_member`) ; `record_loyalty_stamp` passe en 5-aires avec
`p_order_token` â€” usage unique **atomique**
(`update â€¦ where consumed_at is null returning`), le jeton **contourne le
cooldown** (dÃ©cision produit : l'anti-abus est l'usage unique, pas le
cooldown), nouvel Ã©tat `order_invalid`. Trouvailles DB : dix tables
d'Ã©mission de rÃ©compenses et non neuf (le calendrier en porte deux) ; une FK
composite en cascade aurait fait de la purge RGPD une machine Ã  ressusciter
des jetons dÃ©pensÃ©s â€” FK simple `on delete set null`, c'est `consumed_at` qui
porte la rÃ¨gle ; ADR-082 appliquÃ©e frontalement (drop de la 4-aire,
rÃ©Ã©mission des revoke/grant, vÃ©rifiÃ©e au catalogue). CÃ´tÃ© app :
`stampLoyaltyOrder` (copie trait pour trait de `stampLoyaltyVisit` â€” seau
`failClosed` identitÃ© avant SQL, Turnstile identitÃ© inconnue, IP observation
fail-open), `createLoyaltyOrderCodes` (owner/editor, 1..100), page publique
`/commande/[token]` mobile-first, export PNG par lot cÃ´tÃ© marchand. DÃ©faut
trouvÃ© par son propre test anti-oracle : un jeton inconnu tombait sur le
challenge Turnstile **avant** toute RPC â€” Â« rÃ©sous un captcha Â» rÃ©vÃ©lait
l'existence du jeton ; refus et succÃ¨s empruntent dÃ©sormais le mÃªme escalier.

**Revue sÃ©curitÃ© (lecture seule) : GO, 0 critique, 0 Ã©levÃ©, 2 MOYEN + 3
FAIBLE â€” les cinq fermÃ©s avant fusion.**
- MOYEN 1 : le `Set-Cookie` `lc-loyalty-<programId>` (dont le nom livre
  l'UUID) Ã©tait posÃ© sur jeton valide avant tout refus, distinguant
  valide/invalide sans rÃ©soudre de captcha. FermÃ© par pose diffÃ©rÃ©e aprÃ¨s
  franchissement du challenge (`resolvePassportIdentityDeferred`) ; la limite
  rÃ©siduelle a Ã©tÃ© rÃ©Ã©crite â€” le vrai distingueur est le 404/200 de la page,
  ouvert Ã  tous, identique Ã  `/hunt`, prÃ©existant et assumÃ©.
- MOYEN 2 : `/commande` Ã©tait le seul chargeur public du lot sans compteur de
  pression. FermÃ© par `observerPressionIp` fail-open (rÃ¨gle
  `loyaltyOrderPageIp`, calquÃ©e sur `huntStepIp`).
- FAIBLE : commentaire Turnstile faux, corrigÃ© en vÃ©ritÃ© de commentaire
  (motif systÃ©mique prÃ©existant : play/pronostics/quiz/jackpot) ; rÃ©vocation
  d'un jeton dÃ©pensÃ© possible par delete+rÃ©insertion, fermÃ©e par
  `revoke delete from authenticated` (MVP explicitement sans rÃ©vocation) ; le
  `label` (champ libre) survivait Ã  la purge RGPD, fermÃ© en migration
  `20260916120000` (`create or replace` Ã  signature identique, sans piÃ¨ge
  ADR-082).

**Preuve** : typecheck 0, lint 0, `casts:check` 0, `sql:check` ok,
migrations:check 120 / tÃªte `20260916120000`, **218 fichiers / 3554 tests**,
build vert, pgTAP **55 fichiers / 3143 assertions** PASS (base vide et
semÃ©e), `security:audit-db` 540. Preuve mesurÃ©e de l'embed PostgREST sur base
rÃ©elle (HTTP 200, FK composite rÃ©solue) : `/commande` ne rend pas de 404
silencieux.

**Risques rÃ©siduels assumÃ©s** : le 404/200 de la page `/commande` reste
ouvert (identique Ã  `/hunt`) ; ni pÃ©remption ni rÃ©vocation des jetons en
MVP ; le jeton voyage dans l'URL (PostHog le reÃ§oit si consenti, comme
`/hunt` â€” pas de fuite Referer, `Referrer-Policy` strict). ADR-086, ADR-087.

**Reste ouvert** : aucun paiement rÃ©el menÃ© de bout en bout â€” les 14 prix
live sont posÃ©s et le webhook Ã©coute ses six Ã©vÃ©nements, mais la chaÃ®ne
complÃ¨te (carte â†’ webhook â†’ octroi â†’ DÃ©marrer â†’ module ouvert) n'a jamais
tournÃ© d'un trait. Et deux gestes propriÃ©taire : rÃ©voquer la clÃ© `rk_live_`
et le jeton de contournement Vercel.

## V1.42 â€” Le dashboard guidÃ© : Centre d'animation, Carte de l'Aventure, Relancer une formule (âœ… 2026-08-06, branche `chantier/dashboard-guide`, migration `20260914120000`)

**Objectif** : point 3 de l'ordre impÃ©ratif du cahier (Â§9) â€” cinq dÃ©cisions
produit du Â§5 confirmÃ©es : crÃ©ation guidÃ©e, Carte de l'Aventure, Relancer
une formule, Tableau d'Ã©quipe, Centre d'animation.

**Cinq Â« starters Â» Codex retrouvÃ©s, quatre intÃ©grÃ©s.** Des composants purs
non commitÃ©s, dans des worktrees git datÃ©es du 2026-08-03 (base non-ancÃªtre
de `main`), ont Ã©tÃ© archivÃ©s puis repris pour quatre dÃ©cisions. Le
cinquiÃ¨me (carte de partage publique) Ã©tait **obsolÃ¨te** : PublicShare l'a
dÃ©passÃ© en V1.37. DÃ©fauts corrigÃ©s Ã  l'intÃ©gration : apostrophes JSX
bloquant le lint, franÃ§ais non accentuÃ©, Ã©tiquettes malhonnÃªtes (Â« QR Ã 
tester Â» â†’ Â« QR jamais scannÃ©s Â», le compteur n'Ã©tant qu'un proxy
`scan_count = 0` ; Â« Stocks faibles Â» restreint Ã  la roue, seul module oÃ¹ le
seuil existe), prÃ©dicat de navigation dupliquÃ©, section qui disparaissait
au lieu d'un Ã©tat vide.

- [x] **`org_animation_center_counts`** â€” RPC unique plutÃ´t que dix-huit
      comptages, security definer, `is_org_editor` en premier geste,
      REVOKE/GRANT rÃ©Ã©mis (ADR-082 appliquÃ©e une seconde fois), pgTAP
      29 assertions dont l'ACL prouvÃ©e au catalogue. La chasse SQL a trouvÃ©
      dix tables d'Ã©mission de rÃ©compenses et non neuf (le calendrier en
      porte deux) ; sept familles sur neuf prouvent l'annulation par
      l'absence de ligne, `cancelled_at` n'existant que sur les
      participations ; trois exclusions de plus que prÃ©vu Ã©vitaient un
      compteur Ã  18 quand la caisse en sert 10.
- [x] **Carte de l'Aventure** (`src/lib/experience-lifecycle.ts`) â€” projection
      des Ã©tats hÃ©tÃ©rogÃ¨nes des 8 modules (referral exclu, sans statut
      propre) vers les 5 phases du cahier. Un Ã©tat manquait : **Â« prÃªte Â»**
      (publiÃ©e mais pas jouable â€” programmÃ©e, en pause, fenÃªtre fermÃ©e) ;
      confondu avec Â« en cours Â», la Carte aurait affichÃ© une page
      inatteignable comme ouverte. Seul l'Ã©vÃ©nement porte rÃ©ellement la
      rÃ©pÃ©tition (sessions de lobby).
- [x] **Centre d'animation** (`src/lib/centre-animation-server.ts`) â€”
      compteurs par la RPC (le caissier n'appelle rien), Tableau d'Ã©quipe
      dÃ©rivÃ© (jamais de chiffre inventÃ©), chaque lien passe par
      `lienSelonRole`.
- [x] **Relancer une formule** (`src/lib/experience-relance.ts`,
      `src/actions/experience-relance.ts`) â€” sÃ©rialiseur instanceâ†’blueprint
      pour 6 des 8 kinds (structure et rÃ©glages seulement, `.strict()`,
      jamais participants/gains/scans), puis create+publish+apply par le
      moteur transactionnel existant. Ni campagnes (Dupliquer existe), ni
      jackpot (Ã©conomie active non portable). Les IDs d'options de quiz
      divergeaient entre `OPTION_ID_PATTERN` et le schÃ©ma blueprint â€” un
      quiz rÃ©el aurait Ã©tÃ© refusÃ© Ã  sa propre relance ; renumÃ©rotÃ©s avec
      remappage de `correct_option_id`. `contest_matches` porte deux FK vers
      `contests`, embed dÃ©sambiguÃ¯sÃ©.
- [x] Composants : `AnimationCenter` (6 tuiles, liens fournis par le
      parent), `TeamActionBoard`, `GuidedJourney` (5 Ã©tapes, jamais de lien
      sur blocked), `RelaunchFormulaCard`, `RelanceErreur`, `InfoBulle`
      (pattern `details`/`aria-describedby`, zÃ©ro JS client) ajoutÃ©e aux 8
      formulaires de crÃ©ation.
- [x] IntÃ©gration : `/dashboard` (Centre + Tableau, 3e branche du
      `Promise.all` existant), Carte sur 8 pages de dÃ©tail, Relance sur 6,
      gardes de couverture Â« surface sans chemin Â». E2E
      `e2e/dashboard-home.spec.ts` (owner voit les 6 tuiles, l'Ã©diteur perd
      le lien propriÃ©taire avec l'explication, le caissier reste redirigÃ©).

**Revue sÃ©curitÃ© â€” GO, 0 CRITIQUE, 0 Ã‰LEVÃ‰, 2 MOYEN, tous deux fermÃ©s avant
fusion** : les refus de relance Ã©taient des clics morts (`relance_error`
Ã©crit dans l'URL, jamais lu â€” `RelanceErreur role="alert"` posÃ© sur 6
pages) ; le discriminant anti-crÃ©ation-en-masse (seau 10 s) venait du
client, supprimant le seul frein rÃ©el â€” dÃ©rivÃ© cÃ´tÃ© serveur, le `requestId`
client ne sert plus qu'Ã  l'idempotence. 3 INFO consignÃ©s, dont un
prÃ©existant au lot (jetons d'Ã©tape de chasse lisibles par le rÃ´le caisse) â€”
pas une rÃ©gression de ce lot, ouvert dans `docs/bugs.md`.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, build vert, **212
fichiers / 3460 tests** (mesurÃ©s sur l'arbre final, correctifs MOYEN compris),
pgTAP 53 fichiers / 3049 assertions (base vide ET semÃ©e), `security:audit-db`
535, `migrations:check` synchronisÃ©e. ADR-085.

**Reste ouvert** : plafond de relance = 1 blueprint/10 s/source (un vrai
rate-limit dashboard serait un chantier Ã  part) ; le brouillon relancÃ©
porte le nom de la source, seul le blueprint porte Â« Relance de â€¦ Â» ;
`relancerFormule` hÃ©rite du contrÃ´le d'entitlement du moteur (add-on expirÃ©
â†’ refus, alors que V1.35 permettrait un brouillon) ; E2E `dashboard-home`
jouÃ©e localement sur `desktop-smoke` seulement.

## V1.41 â€” La classe du champ non rendu est fermÃ©e par ses propriÃ©tÃ©s, pas par sa forme (âœ… 2026-08-06, branche `chantier/formulaires-null-classe`)

**Objectif** : fermer la classe que V1.38 avait dÃ©crite et non close â€” `entierOptionnel`
rejetait `null`, et `formData.get` en rend un pour tout champ non **rendu**. Aucune
migration.

**Deux modes de panne, pas un.** V1.38/V1.39 n'avaient fermÃ© que le bruyant (rejet
Zod, message opaque). Le mesurer a montrÃ© un second mode, silencieux :
`z.coerce.number()` sans `.nullable()` convertit `null` en `0` (`Number(null) === 0`),
sans erreur. **26 violations mesurÃ©es â€” 3 bruyantes, 23 silencieuses.** Le mode
silencieux ne frappait que les champs dont la borne basse descend Ã  0 : un
`min(1)` refusait `null` **par accident** (0 < 1) â€” la mÃªme faute Ã©tait muette ou
bruyante selon une borne sans rapport avec elle.

**Les plus coÃ»teuses** : les trois cooldowns anti-rejeu (chasse, fidÃ©litÃ©,
jackpot), oÃ¹ 0 est une valeur mÃ©tier (Â« anti-partage dÃ©sactivÃ© Â») â€” un champ non
rendu dÃ©sarmait la protection en la faisant passer pour un choix du commerÃ§ant.
Et `weight` (`prizes.ts`) : un lot de poids 0, jamais tirÃ©, sans erreur ; le
barÃ¨me de pronostics remis Ã  0.

**Le point unique** : `src/lib/validations/champ-formulaire.ts`, sept primitives
(`texteOptionnel`, `entierOptionnel` â€” remontÃ©e d'`admin.ts` â€”, `entierRequis`,
`nonRenduVaut`, `absentSiNonRendu`, `caseACochee`, `nombreRequis`,
`videSiNonRendu`). 62 dÃ©clarations converties sur 12 modules, 98 `??`
d'appelant supprimÃ©s â€” 5 survivent, chacun commentÃ© (4 sur champs obligatoires,
1 oÃ¹ `undefined` â‰  `null` par conception). 45 tests.

**Le verrou tient au comportement, pas au texte** :
`champ-formulaire-coverage.test.ts` vÃ©rifie ce que les schÃ©mas **font** â€” deux
invariants comportementaux sur 300+ champs de 24 modules, Ã©numÃ©rÃ©s depuis les
modules â€” pas leur forme textuelle. Une garde textuelle rougit sur un simple
retour Ã  la ligne et ne voit pas le mode silencieux, qui ne s'Ã©crit ni avec
`.optional()` ni avec `.default(`. L'invariant B (Â« un champ requis refuse
`null` Â») n'a aucune exclusion ; les 37 exclusions de l'invariant A (schÃ©mas
JSON-only : blueprints, webhooksâ€¦) portent chacune une raison Ã©crite et une
dÃ©tection des exclusions mortes. Deux contrÃ´les nÃ©gatifs jouÃ©s et restaurÃ©s :
`.nullable()` retirÃ© â†’ invariant A rouge sur `hunts` ; `weight` ramenÃ© Ã 
`z.coerce.number()` â†’ invariant B rouge sur les 3 chemins `prizes`.

**Risque rÃ©siduel assumÃ©, Ã©crit** : un champ **rendu** mais **vidÃ©** (`""`)
vaut toujours 0 par coercition sur les entiers requis â€” comportement d'origine,
hors classe (le champ a Ã©tÃ© rendu), et le changer refuserait des enregistrements
aujourd'hui acceptÃ©s. DocumentÃ© dans `nombreRequis`.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, `migrations:check` ok (117,
aucune migration dans ce lot â€” pgTAP non rejouÃ©), `sql:check` ok, **197 fichiers
/ 3303 tests** (+45), build vert. ADR-084.

**Reste ouvert** : aucun.

## V1.40 â€” Les derniÃ¨res dettes : la chasse par Ã©tape, une valeur plutÃ´t qu'une nullabilitÃ©, et le vocabulaire alignÃ© (âœ… 2026-08-06, branches `chantier/dernieres-dettes` et `chantier/outcome-et-vocabulaire`)

**Objectif** : vider le tableau des restes consignÃ©s. Migrations `20260912120000`
et `20260913120000`.

**Le retour de `grant_module_from_payment` porte une VALEUR** (ADR-082) :
- La RPC distinguait ses trois issues par la **nullabilitÃ©** de `grant_id` â€” or
  Postgres ne transporte pas la nullabilitÃ© des colonnes d'un `returns table`.
  Le gÃ©nÃ©rateur Ã©crivait `grant_id: string` non-nullable, le webhook compensait
  par un cast d'apparence redondante, et une garde textuelle empÃªchait qu'on le
  supprime : **on protÃ©geait un correctif au lieu d'Ã´ter la cause**.
- `outcome text` vaut dÃ©sormais `'created' | 'replayed' | 'refused'`. `created`
  disparaÃ®t â€” il Ã©tait exactement `outcome = 'created'`, donc une seconde
  Ã©criture d'un mÃªme fait.
- **`DROP` + `CREATE` emporte les privilÃ¨ges**, et c'est la trouvaille la plus
  coÃ»teuse : aprÃ¨s recrÃ©ation, `has_function_privilege('public', â€¦)` repasse Ã 
  `true`. Sans rÃ©Ã©mission des `REVOKE`, une fonction `security definer` **qui
  octroie des modules payants** redevenait appelable par `anon`.
- Un trou que l'ancien encodage ne pouvait pas voir est fermÃ© : `created` Ã©tant
  boolÃ©en, **tout ce qui n'Ã©tait pas `true` â€” ligne absente comprise â€”
  retombait sur Â« rejeu Â»**. Le double paiement se serait tu.

**La chasse au trÃ©sor compte par Ã©tape** (ADR-083) â€” et **le grain Ã©tait dÃ©jÃ 
tranchÃ©** : pour `events`, `resource_id` portait dÃ©jÃ  un sous-objet. Ni colonne
ni table ajoutÃ©e.

**Le vocabulaire est alignÃ© de bout en bout** : `/api/scan` â†’ `/api/page-opens`,
`ScanBeacon` â†’ `PageOpenBeacon`. **Renommage sec, aucun alias** â€” le compteur ne
facture rien et n'autorise rien ; un alias qu'on oublie de retirer devient
permanent. Deux dÃ©tails qui auraient cassÃ© en silence : `src/proxy.ts` excluait
`api/scan` du middleware, et cÃ´tÃ© `sendBeacon` **un 404 est indiscernable d'un
204** â€” un test vÃ©rifie dÃ©sormais que le chemin appelÃ© existe.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, build vert, **194 fichiers /
3258 tests**, pgTAP **52 fichiers / 3020 assertions**, `security:audit-db` 535.

## V1.39 â€” Trois silences fermÃ©s, et le QR se met Ã  compter (âœ… 2026-08-05, branches `chantier/formdata-null` et `chantier/scans-et-typage`)

**Objectif** : les points restÃ©s ouverts de V1.38. Migration `20260911120000`.

- **Un champ non rendu n'est pas un champ vide.** `FormData.get` rend `null` â€”
  pas `undefined` â€” pour un champ absent du DOM, que `.default()` rejette.
  **Aucun octroi `recurring` n'Ã©tait crÃ©able depuis le back-office.** CorrigÃ©
  **au schÃ©ma** : l'audit a montrÃ© que la correction chez l'appelant avait exigÃ©
  un `??` sur **131 sites** et en avait quand mÃªme laissÃ© fuir un.
- **Un argument de RPC mal orthographiÃ© ne compile plus** lÃ  oÃ¹ il coÃ»te de
  l'argent. `rpcStrict` s'appuie sur un mappÃ© homomorphe qui rÃ©arme le contrÃ´le
  de propriÃ©tÃ©s excÃ©dentaires. **5 appels couverts, pas 116** â€” ceux du chemin
  de paiement.
- **Un add-on mensuel impayÃ© restait ouvert POUR TOUJOURS.** `hasActiveAccess`
  teste `live_module_grants` **avant** le statut d'abonnement : un octroi vivant
  court-circuitait les 14 jours de grÃ¢ce. Il reÃ§oit dÃ©sormais une **Ã©chÃ©ance**,
  levÃ©e automatiquement au retour en `active`.
- **Le QR compte ses ouvertures** sur six modules, avec le nom honnÃªte.

**Preuve** : **194 fichiers / 3254 tests**, pgTAP 51 fichiers / 2993 assertions.

## V1.38 â€” Le QR universel est couvert, et le back-office pouvait ne crÃ©er aucun octroi (âœ… 2026-08-05, branche `chantier/qr-restants`)

**Objectif** : fermer le Â§4 du cahier et le dernier point actionnable de V1.37.
Aucune migration.

**Le Â§4 est couvert : huit modules Ã©quipÃ©s, le neuviÃ¨me justifiÃ©.**
- **FidÃ©litÃ©** â€” le plus dÃ©muni des neuf : le dashboard n'exposait son URL
  publique **nulle part**. URL sur l'ID (`loyalty_programs` n'a pas de slug),
  garde `status === "active"` miroir de `loadLoyaltyContext`.
- **Ã‰vÃ©nement** â€” URL sur le `join_code`, **pas l'UUID** : celui que la salle lit
  Ã  voix haute, sans quoi la mÃªme soirÃ©e aurait deux adresses. `event-qr.tsx`
  lu et non modifiÃ©, avec un test qui garde la sÃ©paration â€” data-URL projetÃ©e
  *pendant* la soirÃ©e contre affiche imprimÃ©e *avant*.
- **Parrainage â€” pas de QR, dÃ©cidÃ© et Ã©crit.** Aucune route dÃ©diÃ©e ; le lien est
  `/play/[slug]?ref=<code>`, fabriquÃ© **cÃ´tÃ© joueur**. Sans `?ref=` c'est le QR
  de campagne dÃ©jÃ  existant ; avec un `?ref=` choisi par le commerÃ§ant, **tous
  les scans arrivent parrainÃ©s par la mÃªme personne**, versant les rÃ©compenses Ã 
  un compte arbitraire. Deux assertions rougiront si une route `/parrainage/â€¦`
  apparaÃ®t : la dÃ©cision se rejouera au lieu de se perdre.

**Le back-office dit pourquoi il refuse â€” et pouvait n'en crÃ©er aucun.**
- **Le dÃ©faut trouvÃ© en route Ã©tait plus grave que celui qu'on corrigeait** :
  `formData.get` rend `null` pour un champ **non rendu**, que
  `entierOptionnel` (`z.string().default("")`) rejette. Le panneau n'affiche
  Â« durÃ©e Â» que pour un pass immÃ©diat â€” **aucun octroi `recurring` n'Ã©tait
  crÃ©able depuis le back-office**.
- **PostgREST ne transmet pas `constraint_name`** : on reconnaÃ®t le refus par
  `code === "23505"` **et** l'identifiant de l'index dans le message, jamais la
  phrase â€” elle est traduite et ses dÃ©limiteurs changent de locale en locale.
- **Preuve sur un vrai `23505`**, relevÃ©e sur la base plutÃ´t que supposÃ©e, et
  gravÃ©e dans le test.

**Preuve** : typecheck 0, lint 0, `casts:check` 0, build vert, **191 fichiers /
3207 tests**.

**Reste ouvert** :
- [x] ~~`entierOptionnel` rejette toujours `null` â€” le correctif est **local Ã 
      une action**. C'est une classe, non auditÃ©e.~~ FermÃ©e en V1.41 : la
      classe entiÃ¨re (26 violations, dont 23 silencieuses) est close par
      `champ-formulaire.ts` et sa garde comportementale.
- [ ] Les 10 prix Stripe sont en **test** ; la chaÃ®ne complÃ¨te n'a pas Ã©tÃ©
      Ã©prouvÃ©e de bout en bout, et le passage en live attend cette preuve.

## V1.37 â€” Les huit add-ons sont vendables, le QR gagne trois modules, et deux silences de type sont fermÃ©s (âœ… 2026-08-05, branches `chantier/trois-suites` et `chantier/trois-lots`)

**Objectif** : fermer ce que V1.36 laissait ouvert, et le point 2 de l'ordre
impÃ©ratif du cahier (Â§9). Migration `20260910120000`.

**Les deux add-ons mensuels sont ouverts** (ADR-081) â€” dÃ©cision produit du
propriÃ©taire : *un commerÃ§ant ne peut pas racheter un add-on mensuel dÃ©jÃ  actif*.
- Cette rÃ¨gle **supprime le problÃ¨me au lieu de le tracer** : `(organisation,
  module)` devient la clÃ© de rÃ©vocation, donc aucun identifiant d'abonnement
  Stripe n'a besoin d'Ãªtre persistÃ©. La colonne et son index prÃ©vus disparaissent
  du plan.
- **Index unique partiel** Ã  prÃ©dicat immuable â€” la garde doit tenir en base :
  entre la vÃ©rification de l'action et l'Ã©criture du webhook, un double clic
  ouvre une fenÃªtre oÃ¹ deux paiements partent.
- `partitionnerPrix` sÃ©pare les prix **avant** toute rÃ©solution : un abonnement
  de pass ne voit jamais `apply_stripe_subscription_event_v2`.
- `grant_module_from_payment` gagne une **troisiÃ¨me issue** `(null, false)` â€”
  sans elle, l'index aurait fait rÃ©pondre 500 en boucle sur un conflit dÃ©finitif.

**Le QR passe de 2 modules sur 9 Ã  5** : `PublicShare` gÃ©nÃ©ralise
`contest-share.tsx` (supprimÃ©, non doublÃ©) et sert quiz, pronostics, calendrier
et jackpot. L'arbitrage : expÃ©rience non publiÃ©e â†’ **aucun QR produit**, parce
qu'un QR imprimÃ© et collÃ© en vitrine survit Ã  la page qui l'a produit.

**Deux silences de type fermÃ©s** :
- Les clients Supabase **serveur** sont typÃ©s â€” 82 erreurs rÃ©vÃ©lÃ©es, 82 fermÃ©es
  en cinq gestes distincts, dont 48 corrigÃ©es **Ã  la racine** en un seul endroit.
  Trois zones aveugles closes, dont `runProgressionEditorRpc` oÃ¹ 13 appels
  passaient sans aucune vÃ©rification du nom de RPC ni des arguments.
- `database.contract.test.ts` compare dÃ©sormais la **nullabilitÃ©**, pas
  seulement les noms de colonnes. La garde est **prouvÃ©e sur l'Ã©tat historique**
  du dÃ©pÃ´t : rejouÃ©e contre le commit d'avant le correctif, elle nomme
  `home_score` et `away_score`.

**Le dÃ©faut rÃ©el trouvÃ© en route** : `ContestPrediction.home_score` Ã©tait dÃ©clarÃ©
`number` alors que la migration l'avait rendu nullable le 2026-08-01 â€” le type
contredisait son propre commentaire, et le `null` voyageait jusqu'Ã  l'affichage
joueur.

**Preuve** : typecheck 0, lint 0, `casts:check` vert, build vert, **190 fichiers
/ 3178 tests**, pgTAP `module_grant_recurring` **21 assertions** (150 avec ses
voisins), 114 migrations avec `EXPECTED_MIGRATION` synchronisÃ©e. ADR-081 ;
ADR-079 marquÃ©e comme levÃ©e.

**Reste ouvert** :
- [ ] `STRIPE_PRICE_ID_PASS_*` Ã  poser â€” **geste du propriÃ©taire**, sans quoi
      aucun bouton n'apparaÃ®t.
- [ ] FidÃ©litÃ©, Ã©vÃ©nement et parrainage n'ont toujours pas de QR commerÃ§ant.
- [ ] Un mensuel `past_due` reste ouvert jusqu'Ã  l'annulation Stripe (dÃ©libÃ©rÃ©).
- [ ] Le back-office rend un message opaque sur un cumul de rÃ©current refusÃ©.

## V1.36 â€” P0.4 : un paiement crÃ©e un octroi, et six add-ons deviennent achetables seuls (âœ… 2026-08-05, branche `chantier/p0-4-achat-octrois`)

**Objectif** : fermer la limite que le lot P0.2 laissait ouverte et que
`docs/codex-handoff.md` nommait explicitement â€” Â« aucun flux de paiement/webhook
ne crÃ©e encore ces octrois Â». Migration `20260908120000`.

**Le cÃ´tÃ© rÃ©ception, livrÃ© en premier** :
- **Un paiement crÃ©e un octroi, et le rejeu n'en crÃ©e pas deux.** La RPC
  `grant_module_from_payment` insÃ¨re par `on conflict do nothing` sur un index
  partiel `(organization_id, source_reference) where source = 'stripe'`. Elle ne
  MET PAS Ã€ JOUR sur conflit : un `do update` aurait rendu `created = false`
  tout en redatant la fenÃªtre de la durÃ©e Ã©coulÃ©e depuis l'achat. Stripe rejoue
  ses webhooks ; sans cette garde, une Chasse payÃ©e trente jours en ouvrait
  soixante â€” et l'erreur allant dans le sens du client, personne ne la signale.
- **Les termes viennent du catalogue, jamais du paiement.** `octroi-termes.ts`
  traduit les quatre modÃ¨les de facturation en fenÃªtres. Les lire dans la
  metadata Stripe aurait laissÃ© le client choisir combien de temps il a payÃ©.
- **Deux fenÃªtres distinctes, et elles ne courent pas ensemble** : `activate_by`
  borne le moment oÃ¹ l'octroi peut dÃ©marrer, `starts_at`/`ends_at` la pÃ©riode oÃ¹
  il ouvre le module. Â« 29 â‚¬ / 30 jours, activable dans les 90 jours Â» dÃ©crit
  deux durÃ©es, pas une.
- **Les huit contextes publics renseignent `live_module_grants`** â€” le reste
  ouvert de V1.35 est fermÃ© : un module ouvert par un octroi seul est dÃ©sormais
  visible du **joueur**, pas seulement du commerÃ§ant.

**Le cÃ´tÃ© Ã©mission, livrÃ© ensuite** :
- `octroi-checkout.ts` rÃ©sout le prix Stripe d'un add-on, sous des variables
  **distinctes** de celles de l'abonnement (`STRIPE_PRICE_ID_PASS_*` contre
  `STRIPE_PRICE_ID_ADDON_*`). Deux produits, deux prix, deux variables.
- `createAddonCheckoutSession` ouvre le tunnel. PropriÃ©taire seulement (Â§3 du
  cahier) ; cinq refus distincts vÃ©rifient qu'**aucune session n'est crÃ©Ã©e**.
- `/dashboard/settings/modules` montre les huit options. Visible d'un Ã©diteur,
  qui y lit Â« demandez au propriÃ©taire Â» plutÃ´t qu'une redirection.

**Le geste qui manquait, trouvÃ© sur une question du propriÃ©taire** (Â« les durÃ©es
ne sont pas toutes les mÃªmes Â») â€” migration `20260909120000`, ADR-080 :
- **Cinq add-ons sur six encaissaient sans rien ouvrir.** `starts_at: null` est
  dÃ©libÃ©rÃ© (les 30 jours payÃ©s ne doivent pas courir pendant que le commerÃ§ant
  rÃ©dige ses lots), mais **rien ne faisait sortir l'octroi de `pending`** â€” seul
  le back-office posait `starts_at`, Ã  la main. Seule la Saison de pronostics,
  qui dÃ©marre Ã  l'achat, fonctionnait.
- **Et les durÃ©es n'Ã©taient lues par personne** : `activeDays` (30/31/7/30) et
  `preparationDays` + `playHours` (7 j + 24 h) n'apparaissaient que dans
  l'affichage du tarif. Le dÃ©faut Ã©tait invisible Ã  typecheck, lint, 3121 tests,
  build et pgTAP : chaque piÃ¨ce Ã©tait correcte sÃ©parÃ©ment, c'est le **geste** qui
  les relie qui manquait.
- `activate_module_grant` (RPC `service_role`) + `termesActivation`, symÃ©trique
  de `termesDepuisCatalogue` : l'un traduit un **achat** en fenÃªtre d'activation,
  l'autre un **dÃ©marrage** en fenÃªtre de jeu. Les deux durÃ©es du Â§2 sont enfin
  distinctes **et toutes deux appliquÃ©es** â€” 30, 31, 7, 30 jours, et **8 jours**
  pour la SoirÃ©e en jeu.
- **Bouton explicite** et non dÃ©marrage Ã  la publication : le compteur partirait
  sinon sur une publication faite Â« pour voir Â», et rien ne rend une durÃ©e payÃ©e.
  La date de fin est annoncÃ©e **avant** le clic.
- Cloisonnement **dans le `where`** de la RPC : un identifiant d'octroi trouvÃ©
  dans un journal ne dÃ©signe rien chez un autre commerÃ§ant.

**Ce que ce lot NE fait pas, et pourquoi** :
- [ ] **Les deux add-ons mensuels ne sont pas vendables** (Â« Passeport des
      habituÃ©s Â», Â« Bouche-Ã -oreille Â»). Un `recurring-monthly` crÃ©erait un
      abonnement Stripe sÃ©parÃ© dont le prix est inconnu de
      `resolveStripeEntitlements` â†’ 500 en boucle. Et la correction Ã©vidente est
      **pire** : ignorer ce prix ferait retomber la rÃ©solution sur `PLANS[0]` et
      Ã©craserait le plan payÃ© de l'organisation. FermÃ© en amont par
      `venteEnLigneOuverte` â€” voir ADR-079 et `docs/bugs.md`.
- [ ] **Aucun produit ni prix Stripe n'est crÃ©Ã©.** Le cahier l'interdit sans
      accord (Â§2 et Â« BloquÃ© Â»). Sans variable, `addonAchetableEnLigne` rend
      `false` et aucun bouton n'apparaÃ®t : le code est livrable Ã  froid, la
      vente s'allume quand le propriÃ©taire pose les prix.

**Preuve** : suite complÃ¨te **187 fichiers / 3126 tests** verts, typecheck 0,
lint 0, build vert avec `/dashboard/settings/modules` compilÃ©e, pgTAP
`module_grant_payment` **19 assertions** et `module_grant_activation`
**14 assertions** PASS sur base rÃ©elle (ligne de base mesurÃ©e : 47 fichiers de
test sur `main`, 49 avec ce lot). ADR-079, ADR-080.

## V1.35 â€” P0.3 : dÃ©couvrir, prÃ©parer, publier â€” et le droit d'un module cesse d'avoir huit lieux de rÃ©ponse (âœ… 2026-08-04, branche `chantier/p0-3-capacites-modules`)

**Objectif** : le lot P0.3 proposÃ© par Codex dans `docs/codex-handoff.md` â€”
rendre le dashboard cohÃ©rent avec le droit effectif. **Aucune migration** : la
base portait dÃ©jÃ  toutes les gardes depuis les lots P0.1 et P0.2.

- **LE DÃ‰FAUT TROUVÃ‰ EN ROUTE, ET IL RENDAIT LA SUITE ININSTALLABLE.** Le
  droit effectif d'un module Ã©tait Ã©crit **huit fois**. Le lot 2 (migration
  `20260907120000`) a fait de Â« tout add-on peut Ãªtre achetÃ© seul Â» une rÃ¨gle
  de base â€” `org_has_module_access` accorde le module dÃ¨s qu'un octroi datÃ© est
  vivant, sans exiger ni abonnement ni boolÃ©en `addon_*`. **Six** des huit
  fonctions TypeScript ont reÃ§u cette branche : celles de `subscription.ts`.
  `hasQuizAccess` et `hasReferralAccess` vivent dans `quiz-context.ts` et
  `referral-context.ts` et ne l'ont pas reÃ§ue. **Le commerÃ§ant qui achetait le
  seul Quiz express ou le seul Bouche-Ã -oreille obtenait de Postgres le droit
  de publier son module, et de l'Ã©cran un refus** â€” exactement le module qu'il
  venait de payer, et le seul qu'il ait payÃ©.
- **Leur en-tÃªte disait pourquoi** : elles Ã©taient dÃ©finies lÃ  parce que Â« le
  fichier `subscription.ts` relÃ¨ve de l'agent stripe-billing Â». Une frontiÃ¨re
  de **rÃ©partition du travail**, pas de domaine. Elle a tenu jusqu'Ã  ce qu'une
  rÃ¨gle change et ne soit corrigÃ©e que lÃ  oÃ¹ on la voyait. La rÃ¨gle est retirÃ©e
  des huit et concentrÃ©e dans `droitEffectifModule` ; les huit fonctions
  restent comme **faÃ§ades** (quatre-vingts appelants les nomment).
- **LE CHARGEUR QUI MANQUAIT AU LOT 2.** Le champ `live_module_grants` Ã©tait
  optionnel et **personne ne le renseignait** â€” son propre docstring Ã©crivait
  dÃ©jÃ  la consÃ©quence (Â« un appelant qui ne renseigne pas ce champ refusera un
  droit que la base accorde Â»). Ce n'Ã©tait donc pas une capacitÃ© Ã  moitiÃ©
  faite : sa moitiÃ© **visible refusait ce que sa moitiÃ© invisible accordait**.
  `chargerOctroisVivants` est branchÃ© sur `getUserAndOrg`, seul entonnoir du
  dashboard ; douze gardes d'action en bÃ©nÃ©ficient sans Ãªtre touchÃ©es.
- **LES TROIS CAPACITÃ‰S EXISTENT** (`canExplore` / `canEditDraft` /
  `canPublish`), qui n'Ã©taient nulle part â€” le seul `canPublish` du dÃ©pÃ´t
  concernait la publication d'une *version de blueprint*. Le module ne dÃ©cide
  pas du droit : `droitEffectif` est une **entrÃ©e**, sinon on refabriquerait la
  seconde source de vÃ©ritÃ© qu'on vient de supprimer.
- **SEPT PAGES S'OUVRENT.** Sans le droit, elles rendaient **uniquement** une
  carte d'offre : le commerÃ§ant devait payer pour voir ce qu'il payait. Le mur
  devient un bandeau, la page continue en dessous. **`createContest` Ã©tait la
  seule action des neuf Ã  garder la CRÃ‰ATION** et non la publication : corrigÃ©e
  dans le sens du cahier Â§3.
- **Le quota d'un brouillon gratuit borne une COURTOISIE, pas une recette** â€”
  huit actions l'appliquent cÃ´tÃ© serveur avec le mÃªme calcul que l'Ã©cran, et le
  contourner ne donne qu'un second brouillon, jamais une expÃ©rience publiÃ©e.
  D'oÃ¹ l'absence dÃ©libÃ©rÃ©e de contrepartie SQL.
- **Trois gardes neuves, toutes dÃ©rivÃ©es** : `MODULE_ADDON_COLUMN` comparÃ©e au
  `case p_module` **lu** dans la migration ; `RESSOURCE_MODULE` comparÃ©e aux
  neuf `create trigger â€¦ guard_module_publication(...)` ; et la couverture du
  quota, oÃ¹ le parrainage est le **seul exemptÃ© avec son motif Ã©crit** (pas de
  crÃ©ation, un rÃ©glage boolÃ©en par campagne).
- **LES GARDES ONT MORDU LEUR AUTEUR TROIS FOIS**, et c'est leur intÃ©rÃªt : la
  garde de paritÃ© a rendu son `throw` de non-vacuitÃ© sur un `indexOf("end\n")`
  face Ã  des fins de ligne **CRLF** (sans lui : table vide, 12 verts qui ne
  comparent rien) ; la garde de couverture a rougi six fois sur des guillemets
  simples qu'aucun lint ne signalait ; et un `tsc | head && echo OK` a affichÃ©
  **OK au-dessus de cinq erreurs rÃ©elles** â€” treiziÃ¨me forme du motif Â« le
  dÃ©tecteur ment Â» : un code de sortie avalÃ© par un tube.

**Preuve** : typecheck 0, lint 0 sur tout le dÃ©pÃ´t, build vert (Windows),
**181 fichiers / 3049 tests** verts (+22). Deux contrÃ´les nÃ©gatifs jouÃ©s avec
leur protocole, copies prises AVANT sabotage, restaurations vÃ©rifiÃ©es Ã 
l'octet (1 rouge / 11 verts ; 1 rouge / 42 verts).

**Reste ouvert, Ã©crit et non arrondi** : les **huit contextes PUBLICS**
chargent leur organisation par leur propre requÃªte et ne renseignent pas
`live_module_grants` â€” un module ouvert par un octroi seul reste fermÃ© au
**joueur**. Ã‰crit dans le docstring du chargeur, Ã  l'endroit exact oÃ¹
quelqu'un croirait tenir une couverture complÃ¨te. Sans effet aujourd'hui
(aucun chemin d'achat ne crÃ©e d'octroi, seul le back-office en pose) ; Ã 
fermer dans le lot suivant, faute de quoi la premiÃ¨re vente d'add-on autonome
produira des pages de jeu introuvables.

## V1.34 â€” Les deux derniÃ¨res dettes de `docs/bugs.md`, fermÃ©es (âœ… 2026-08-04, branche `chantier/deux-derniers-ouverts`)
**Objectif** : solder les deux seules entrÃ©es encore ouvertes du journal des
bugs. Aucune migration.

- **La phrase d'annulation en caisse est RENDUE, plus seulement Ã©crite.**
  `WheelResult` et `ContestResult` sont montÃ©s contre des doubles. **Cette
  dette Ã©tait une impossibilitÃ© et est devenue faisable la veille** : son motif
  Ã©crit Ã©tait Â« ce dÃ©pÃ´t n'a aucun environnement de rendu React Â», mort avec
  V1.33 â€” ce qui justifiait de ne pas faire Ã©tait devenu ce qui permettait de
  faire, sans que personne le remarque.

- **La justification d'origine Ã©tait fausse, et la mesure l'a dit.** Il Ã©tait
  Ã©crit que la garde textuelle serait aveugle Ã  la disparition de la phrase :
  elle rend 1 rouge / 18 verts. L'Ã©cart rÃ©el tient Ã  un **autre** sabotage â€”
  la phrase *prÃ©sente mais inatteignable* (`{false && â€¦}`), oÃ¹ la textuelle
  rend **19 verts, 0 rouge** quand le rendu rend 2 rouges. La frontiÃ¨re
  d'ADR-074 est dÃ©sormais mesurÃ©e sur ce couple, plus citÃ©e.

- **Les dix-neuf compteurs d'IP passent par un seul chemin.** Le compte exact
  est **19**, pas Â« une vingtaine Â». Un **helper** (`observerPressionIp`)
  plutÃ´t que dix-neuf transformations : le motif faisait six lignes rÃ©parties
  dans douze fichiers, et c'est cette dispersion qui les avait dÃ©synchronisÃ©es.
  Il n'est pas plus court, il est **impossible Ã  oublier Ã  moitiÃ©**. La
  migration est **invisible en supervision** â€” clÃ© identique au caractÃ¨re prÃ¨s
  quand l'IP est mesurÃ©e ; seul le trafic versÃ© dans `â€¦:unknown` change de
  sÃ©rie.

- **Neuf sites ne sont dÃ©libÃ©rÃ©ment PAS migrÃ©s** : ce sont des `rateLimit`,
  donc des **refus**, et ADR-032 interdit qu'une clÃ© partagÃ©e en porte un.

- **L'obstacle documentÃ© Ã©tait rÃ©el et plus petit qu'annoncÃ©** : 79 tests dans
  11 fichiers, mesurÃ©. Huit venaient de mocks ne fournissant que
  `clientIpFromHeaders` ; trois Ã©taient des gardes dont la **regex** avait
  vieilli, pas la garantie.

- **LE CONTRÃ”LE NÃ‰GATIF A TROUVÃ‰ UN TROU QUE LA RELECTURE N'AURAIT PAS VU** :
  Ã©tiquetage du helper neutralisÃ© â†’ **210 verts, 0 rouge**. Dix-neuf sites
  venaient d'Ãªtre migrÃ©s vers une fonction concentrant la rÃ¨gle de tout le
  dÃ©pÃ´t, et **rien ne la testait** â€” la classe de dÃ©faut que ce dÃ©pÃ´t se
  reproche, reproduite en la corrigeant. Garde ajoutÃ©e ; mÃªme sabotage rejouÃ©
  â†’ **1 rouge / 5 verts**, nommant le dÃ©faut exact.

**Preuve** : typecheck 0, lint 0, build vert (Windows), **172 fichiers / 2886
tests** (+6), restaurations vÃ©rifiÃ©es Ã  l'octet depuis des copies prises AVANT
sabotage. **`docs/bugs.md` ne porte plus aucune entrÃ©e OUVERTE.**

## V1.33 â€” Ce dÃ©pÃ´t sait rendre du React en test, et la roue porte le lien (âœ… 2026-08-04, branche `chantier/lien-roue-et-rendu`)
**Objectif** : les deux restes ouverts de V1.32, dont le second Ã©tait
structurel. Aucune migration.

- **Â« Faute d'environnement de rendu React Â» n'Ã©tait pas un aveu de paresse
  mais un FAIT de configuration** â€” `vitest.config.ts` n'incluait que
  `src/**/*.test.ts` et tournait en `environment: "node"`. ConsÃ©quence que
  personne n'avait Ã©crite : un test de composant n'y Ã©tait pas *rouge*, **il
  n'Ã©tait pas collectÃ©**. LevÃ© par `happy-dom` + `@testing-library/react` et
  `.tsx` dans `include` (ADR-076).

- **`node` reste le dÃ©faut, et c'est dÃ©libÃ©rÃ©.** Les ~2860 tests de logique
  n'ont aucun besoin d'un DOM ; un fichier qui rend un composant demande le
  sien par `// @vitest-environment happy-dom`. MesurÃ© : **+17 s** d'environnement
  sur la suite, pour trois fichiers â€” le coÃ»t est payÃ© par ceux qui en
  profitent et par personne d'autre.

- **La roue porte le lien, et pas lÃ  oÃ¹ V1.32 l'avait annoncÃ©.** V1.32 parlait
  de Â« ses trois Ã©crans Â» ; en les ouvrant, les trois dÃ©lÃ¨guent au **mÃªme**
  composant, `RedeemCodeScreen`, point de passage de **huit** surfaces (quatre
  Ã©crans de roue/skill, quatre tours offerts). Un seul point d'insertion au
  lieu de trois, huit surfaces couvertes au lieu de quatre. Le lien est posÃ©
  dans **ses deux vues** â€” la seconde Ã©tant la plus utile : sur le code expirÃ©,
  Â« rapprochez-vous du staff Â» laissait le client sans rien Ã  regarder alors
  que ses **autres** lots sont peut-Ãªtre encore bons.

- **Pourquoi le rendu Ã©tait ici NÃ‰CESSAIRE, et pas seulement souhaitable.** Les
  deux vues sont mutuellement exclusives : un import unique en tÃªte de fichier
  satisfait une garde textuelle mÃªme si le lien n'est posÃ© que dans l'une.
  DÃ©monstration chiffrÃ©e â€” sabotage de la **seule** vue expirÃ©e, import laissÃ©
  en place (`grep` : 2 â†’ 1) : **une garde textuelle serait restÃ©e verte**, le
  test de rendu rend **1 rouge / 3 verts** en dÃ©signant la vue exacte.

- **Les gardes textuelles sont CONSERVÃ‰ES, sans exception.** Leur angle mort
  est le bon : elles **se dÃ©rivent du systÃ¨me de fichiers**, donc elles
  attrapent l'Ã©cran Ã©crit demain â€” c'est ce qui avait trouvÃ© les pronostics
  manquants. Deux gagnent mÃªme un motif plus fort qu'avant : celles de
  `player-wallet-screen` ferment des interdits d'**absence**, or un rendu ne
  prouve jamais qu'une chose n'existe nulle part.

- **Le piÃ¨ge central de V1.32 est enfin gardÃ©** : le champ **cachÃ©** de
  `CodeTtlDaysField`, maillon dont dÃ©pendaient les deux gardes du chantier
  prÃ©cÃ©dent, que personne ne vÃ©rifiait â€” ce qu'il faut mesurer est *ce que le
  navigateur enverrait*. Sept assertions, dont celle qui grave le dÃ©faut rÃ©el :
  une colonne non chargÃ©e rend une case vide, donc **effacerait**.

- **QUINZE commentaires devenus faux, corrigÃ©s en place** (plus deux
  documents) â€” le motif que ce dÃ©pÃ´t se reproche depuis cinq chantiers.
  **Aucune conclusion n'est annulÃ©e** : les modules purs restent extraits, pour
  une raison qui ne dÃ©pendait pas de la contrainte.

- **DEUX erreurs de mÃ©thode, et la seconde est la plus instructive du lot.**
  (a) Ma premiÃ¨re assertion de nom accessible lisait `textContent` â€” le rendu
  l'a fait rougir, et il avait raison : `textContent` inclut `aria-hidden`, que
  l'algorithme accname **exclut**. (b) **J'ai d'abord annoncÃ© DOUZE, et le
  chiffre Ã©tait faux** : mon recensement passait par `grep â€¦ | head -12`, donc
  le plafond a rendu exactement douze lignes et j'ai lu ce plafond comme un
  total. Trois fichiers de code et deux documents sont restÃ©s faux, publiÃ©s
  comme corrigÃ©s dans un commit, une PR et quatre documents. **C'est une
  occurrence NEUVE du motif Â« le dÃ©tecteur ment Â»** : ni un sabotage qui ne
  mord pas, ni un dÃ©tecteur muet â€” un **plafond d'affichage lu comme une
  mesure**. Le contrÃ´le qui l'a rattrapÃ© n'Ã©tait pas un test mais une question
  (Â« il ne reste plus rien ? Â») suivie d'un recomptage sans plafond. RÃ¨gle
  retenue : **un compte qu'on publie ne se lit jamais sur une sortie
  tronquÃ©e** â€” `wc -l` avant `head`, toujours.

**Preuve** : typecheck 0, lint 0, build vert (Windows), **170 fichiers / 2876
tests** (+3 fichiers, +14), casts:check OK, test:casts 4/4, migrations:check
108 fichiers, sql:check OK, `npm audit --omit=dev` **0 vulnÃ©rabilitÃ©**.
ContrÃ´le nÃ©gatif avec protocole (1 rouge / 3 verts), restauration vÃ©rifiÃ©e Ã 
l'octet depuis une copie prise AVANT sabotage. ADR-076 ; ADR-074 reÃ§oit un
addendum (sa doctrine est inchangÃ©e, son pÃ©rimÃ¨tre s'Ã©tend aux composants).

## V1.32 â€” L'Ã©chÃ©ance des lots devient rÃ©glable, et le portefeuille cesse d'Ãªtre atteignable par personne (âœ… 2026-08-04, branche `chantier/echeance-lots`)
**Objectif** : la question laissÃ©e au propriÃ©taire par V1.31 â€” les sept
familles sans Ã©chÃ©ance â€” est tranchÃ©e, et le rÃ©glage descend jusqu'au client.
Quatre lots : la migration `20260904120000` et le cÃ¢blage des sept actions
(livrÃ©s par la session prÃ©cÃ©dente), puis les Ã©crans commerÃ§ant et le chemin du
joueur (ce qui suit).

- **Le commerÃ§ant rÃ¨gle l'Ã©chÃ©ance depuis ses sept Ã©diteurs.** Un composant
  partagÃ© `CodeTtlDaysField`, et non sept blocs recopiÃ©s : la phrase qui
  explique qu'un code dÃ©jÃ  Ã©mis garde son Ã©chÃ©ance est la mÃªme partout. Ce qui
  diffÃ¨re par famille est passÃ© en argument â€” l'instant d'oÃ¹ court le dÃ©lai
  (fin de chasse, palier atteint, tirage, fin de session, ouverture de case,
  filleul validÃ©, quiz terminÃ©), jamais Â« Ã  partir du passage en caisse Â» : le
  dÃ©compte part de l'**Ã©mission**.

- **TROIS PAGES SUR SEPT NE LISAIENT PAS CE QU'ELLES RÃ‰Ã‰CRIVAIENT** â€” jackpot,
  fidÃ©litÃ©, calendrier sÃ©lectionnaient leurs colonnes une par une sans
  `code_ttl_days`. Le champ s'affichait vide, le commerÃ§ant relisait Â« Sans
  limite Â» lÃ  oÃ¹ il avait rÃ©glÃ© 30 jours, et le premier enregistrement du mÃªme
  formulaire reposait `''` â€” donc **effaÃ§ait rÃ©ellement le rÃ©glage**, sans
  message et sans trace. La garde d'Ã©criture du lot prÃ©cÃ©dent (`formData.has`)
  Ã©tait **intacte** pendant tout ce temps : elle recevait une clÃ© prÃ©sente et
  une valeur vide, exactement le geste Â« efface Â», indistinguable du geste
  volontaire. **Une garde posÃ©e au bon endroit ne protÃ¨ge de rien quand c'est
  l'alimentation du formulaire qui manque.**

- **Et `tsc` ne pouvait pas l'attraper** : les trois pages castent le rÃ©sultat
  PostgREST vers des interfaces qui dÃ©clarent toutes `code_ttl_days: number |
  null`. TypeScript ne relie pas une chaÃ®ne de `select()` Ã  une interface â€” il
  croit la colonne prÃ©sente, l'exÃ©cution rend `undefined`, et le champ confond
  lÃ©gitimement Â« jamais chargÃ©e Â» avec Â« pas d'Ã©chÃ©ance Â». Aucun type ne sÃ©pare
  ces deux cas puisque c'est l'interface elle-mÃªme qui ment. D'oÃ¹ une garde
  mÃ©canique **qui se dÃ©rive** (tables â† migration, Ã©diteurs â† qui importe le
  composant, pages â† qui importe un Ã©diteur), et qui rÃ©sout les constantes de
  colonnes du fichier â€” deux des trois pages fautives passaient par lÃ .

- **Le portefeuille du client Ã©tait complet et atteignable par personne.**
  `/portefeuille` rassemble dÃ©jÃ  les lots des neuf familles, lit leur Ã©chÃ©ance
  dans le **registre** (`reward_issuances.expires_at`) et distingue Â« Ã€
  retirer Â», Â« expire bientÃ´t Â» et Â« ExpirÃ© Â» â€” mais son adresse n'apparaissait
  **dans aucun fichier du produit sauf le sien**. Le motif dÃ©jÃ  reprochÃ©
  plusieurs fois ici â€” une capacitÃ© livrÃ©e sans chemin applicatif pour
  l'atteindre â€” pris du cÃ´tÃ© de l'Ã©cran et non de la base.

- **La date n'est PAS recopiÃ©e sous chaque code, et c'est le point.** La voie
  Ã©vidente Ã©tait d'Ã©crire l'Ã©chÃ©ance sur les sept Ã©crans de gain. Ã‰cartÃ©e :
  quatre des sept contextes passent par une RPC `*_public_state` qui ne rend
  pas la colonne, et surtout la relire ailleurs que dans le registre
  fabriquerait une **seconde source de vÃ©ritÃ© pour une date que la caisse
  tranche** â€” la caisse lit le registre, pas les tables d'Ã©mission. Huit liens
  Â« Mes rÃ©compenses Â» envoient le client lÃ  oÃ¹ la date est dÃ©jÃ  lue au bon
  endroit.

- **La garde a trouvÃ© un huitiÃ¨me Ã©cran pendant que le travail s'Ã©crivait.**
  Les Ã©crans de gain ne se dÃ©rivent d'aucun dossier â€” ce qui les dÃ©finit est
  une propriÃ©tÃ© de sens. La liste Ã©crite Ã  la main est donc **confrontÃ©e** au
  texte qu'ils portent tous, et la confrontation a immÃ©diatement rougi : les
  **pronostics** manquaient. Ce n'est pas une garde qui valide un travail fini,
  c'est une garde qui l'a corrigÃ© â€” la liste Ã  la main aurait livrÃ© sept Ã©crans
  sur huit.

**Reste OUVERT, Ã©crit et non arrondi** : la **roue** ne porte pas le lien. Ses
trois Ã©crans disent Â« prÃ©sentez cet Ã‰CRAN au comptoir Â», le gain y Ã©tant
l'Ã©cran lui-mÃªme, et `claim-form` porte dÃ©jÃ  son propre traitement d'Ã©chÃ©ance
(compte Ã  rebours, Â« Ce code n'est plus valable Â»). Le critÃ¨re retenu est net
et vÃ©rifiable â€” un code de retrait affichÃ© en toutes lettres â€” plutÃ´t
qu'extensible au jugÃ© ; le lien y resterait utile.

**Preuve** : typecheck 0, lint 0, build vert (Windows), **167 fichiers / 2862
tests**, casts:check OK, test:casts 4/4, test:sql 12/12, test:migrations 9/9,
sql:check OK, migrations:check **108 fichiers**, `EXPECTED_MIGRATION`
synchronisÃ©e. Deux contrÃ´les nÃ©gatifs jouÃ©s avec leur protocole (1 rouge / 1
vert, puis 1 rouge / 2 verts) â€” **le second n'a pas mordu au premier essai**
(`perl -pi` avec `\n$` sur des fins de ligne CRLF, `grep -c` rendant 1 au lieu
de 0), repris en `perl -0pi` avec `\r?\n`. **Trou assumÃ©** : pgTAP n'a pas Ã©tÃ©
rejouÃ© sur cette branche â€” les deux lots ne touchent aucun SQL, et la
migration porte dÃ©jÃ  son fichier `reward_expiry_days.test.sql` inscrit en CI
(44 fichiers sur disque, 44 inscrits).

## V1.31 â€” RÃ©gler ce qui reste dans bugs.md : trois dettes fermÃ©es, quatre Ã©tiquettes Â« OUVERT Â» qui mentaient (âœ… 2026-08-03, branche `chantier/solde-bugs`)
**Objectif** : demande du propriÃ©taire â€” Â« rÃ¨gle ce qui reste dans
`docs/bugs.md` Â». Sept entrÃ©es y portaient Â« OUVERT Â». Le travail n'Ã©tait donc
pas seulement de corriger du code : c'Ã©tait que **plus aucune entrÃ©e Â« OUVERT Â»
ne soit en rÃ©alitÃ© une dÃ©cision dÃ©guisÃ©e**, une Ã©tiquette qui fait croire Ã  un
correctif en attente et dÃ©place le travail vers un problÃ¨me que personne
n'entend rÃ©soudre. Aucune migration sur cette branche.

- [x] **Le seau `huntRecall` ne bornait pas un dÃ©bit, et rien n'Ã©tait posÃ© Ã 
      cÃ´tÃ©** â€” sa clÃ© contient le sha256 de la **valeur** d'un cookie que le
      porteur fait tourner Ã  chaque requÃªte : les deux gardes amont ne
      regardent que le NOM, le hash est neuf Ã  chaque coup, aucun seau ne se
      remplit. Il borne un porteur **coopÃ©ratif**, et reste conservÃ© pour cela.
      Ce qui change : un `observeSharedKey` sur (chasse, IP), seau
      `huntRecallIp`, **fail-open**, intercalÃ© **entre la garde 2 et la garde
      3** â€” exactement la population que la garde 3 prÃ©tendait borner.
      Application directe du terme moyen d'ADR-073 : ADR-032 proscrit de
      *refuser* sur une clÃ© partagÃ©e, elle *prescrit* un compteur large et
      fail-open. **Le `failClosed: false` d'ADR-070 est intact** : un compteur
      ne refuse rien. **Seau propre et non rÃ©utilisation de `huntStepIp`**,
      bien que les deux chargeurs servent la **mÃªme requÃªte** â€” le rappel ne
      tourne qu'aprÃ¨s le refus du chargeur d'Ã©tape, qui a dÃ©jÃ  comptÃ© ; une
      clÃ© commune compterait un passage pour deux. SÃ©parÃ©s, **leur rapport est
      l'information** : la part du trafic d'une chasse qui retombe sur le
      repli.
- [x] **`WheelResult` et `ContestResult` rendaient Â« annulÃ© Â» sans cause** â€” le
      caissier lisait deux vocabulaires selon le chemin qui l'avait servi.
      `phraseCaisseAnnulation("merchant")` sous les deux badges, **sans aucune
      lecture fabriquÃ©e de `cancelled_source`** : atteindre ces branches prouve
      que la ligne parente **vit**, or purge et cascade la font disparaÃ®tre et
      la caisse retombe alors sur la carte du registre. Le paramÃ¨tre est typÃ©
      `CauseAnnulation` â€” Ã©largir le vocabulaire fait Ã©chouer `tsc` plutÃ´t que
      de laisser ces cartes muettes.
- [x] **`clientIpFromHeaders` rendait `"unknown"` et agrÃ©geait tous les
      visiteurs dans un seau unique** â€” Ã  un seuil calibrÃ© pour un seul d'entre
      eux. FermÃ© pour les **deux compteurs chasse** par `pressionParIp` (module
      pur neuf) : clÃ© `ip-non-mesuree`, Ã©vÃ©nement suffixÃ© `.ip_non_mesuree`.
      **Arbitrage : compter quand mÃªme plutÃ´t que s'abstenir** â€” s'abstenir
      aurait jetÃ© la **dÃ©tection** avec l'attribution, alors que sous un dÃ©bit
      rÃ©el l'agrÃ©gat franchit le seuil et reste le seul signal lÃ  oÃ¹ aucun
      proxy n'est dÃ©clarÃ©. Deux sÃ©ries qu'aucun tableau de bord ne peut
      confondre, ni par clÃ© ni par nom. **ADR-075.**
- [x] **Quatre entrÃ©es requalifiÃ©es : ce ne sont pas des dettes** â€” le repli
      `merchant` indistinguable (alignement **dÃ©libÃ©rÃ©** caisse/portefeuille,
      ADR-072 : deux Ã©crans qui parlent au mÃªme client ne doivent pas se
      contredire) ; le calibrage hÃ©ritÃ© (**trois seuils, une seule origine**,
      `huntScanIp` â†’ `huntStepIp` â†’ `huntRecallIp` â€” aucun trafic rÃ©el Ã 
      mesurer, une seule organisation en production) ; les deux sentinelles
      textuelles de `cancelled_reason` (elles ne dÃ©cident plus rien, et les
      refuser au formulaire serait un palliatif qui ne couvre pas le `PATCH`
      PostgREST **en laissant croire Ã  une garde**) ; et les sept familles sans
      Ã©chÃ©ance pour les lots **non annulÃ©s**, prÃ©sentÃ©e comme une **question au
      propriÃ©taire** â€” donner une expiration Ã  un lot de chasse ou de fidÃ©litÃ©
      change ce que le client peut encaisser, c'est un arbitrage produit.

**Ce que ce chantier ouvre, Ã©crit et non arrondi** :
- La **vingtaine d'autres `observeSharedKey` clÃ©s sur l'IP** (quiz, calendrier,
  jackpot, fidÃ©litÃ©, parrainage, Ã©vÃ©nement, pronostics, skill, play,
  mÃ©ta-progression) concatÃ¨nent toujours l'IP brute et retombent dans le seau
  agrÃ©gÃ© `â€¦:unknown`. **Ã‰crit dans le docstring de `pressionParIp`** plutÃ´t que
  prÃ©sentÃ© comme une garde transverse. Les migrer casserait plusieurs gardes
  **textuelles** existantes (`quiz.test.ts`, `calendar.test.ts`,
  `referral.test.ts` matchent la source Ã  la regex) â€” c'est un chantier.
- La garde de la phrase d'annulation est **textuelle** (ADR-074) : elle prouve
  qu'une phrase est Ã©crite Ã  cÃ´tÃ© de chaque badge, jamais qu'elle est
  **rendue** â€” aucun environnement de rendu React dans ce dÃ©pÃ´t.

**Enseignement de mÃ©thode, versÃ© aux Notes de docs/bugs.md** : un sabotage par
`perl -0pi` **n'a pas mordu** (regex multiligne), et le `git checkout --` de
nettoyage qui a suivi **a Ã©crasÃ© le travail en cours** â€” restaurÃ© depuis une
copie prise avant sabotage. **DouziÃ¨me** occurrence du motif Â« le dÃ©tecteur
ment Â» sur les cinq derniers chantiers, mais la **premiÃ¨re oÃ¹ le nettoyage du
contrÃ´le nÃ©gatif est lui-mÃªme dangereux**. La leÃ§on n'est pas Â« ne pas
saboter Â» : c'est **prendre la copie avant**, et **ne jamais nettoyer un
sabotage par un `git checkout --` sur un fichier qu'on est en train
d'Ã©diter**.

**Preuve** : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build vert
(Windows), **163 fichiers / 2827 tests** (+32), test:sql 12/12,
migrations:check 107 fichiers, test:migrations 9/9, sql:check OK, pgTAP **43
fichiers / 2669 assertions PASS, base vide ET semÃ©e** â€” *exactement le chiffre
de `main`*, aucune migration sur cette branche. ContrÃ´les nÃ©gatifs rejouÃ©s par
QA et confirmÃ©s : compteur de rappel neutralisÃ© â†’ 2 rouges / 76 verts ;
Ã©tiquetage retirÃ© â†’ 4 rouges / 74 verts ; phrase retirÃ©e â†’ 1 rouge / 77 verts ;
intÃ©gritÃ© de la suite revÃ©rifiÃ©e aprÃ¨s l'incident par comptage des `it()`
fichier par fichier. **Seul trou** : les E2E n'ont pas Ã©tÃ© exÃ©cutÃ©s (ils figent
WSL) ; vÃ©rifiÃ© par mesure qu'aucun spec n'asserte les textes ni le markup
modifiÃ©s, mais ce n'est pas une exÃ©cution.

## V1.30 â€” Les trois derniers ouverts du dÃ©pÃ´t, fermÃ©s : une explication a une Ã©chÃ©ance, une garde textuelle ne prouve rien (âœ… 2026-08-03, branche `chantier/derniers-ouverts`)
**Objectif** : fermer les **trois derniers points ouverts** consignÃ©s dans
docs/bugs.md par le chantier de la veille. Pas une fonctionnalitÃ© â€” la
liquidation d'un reliquat, et l'occasion de constater que deux de ces trois
points n'Ã©taient pas des dettes de code mais des **raisonnements sautÃ©s**.

- [x] **Un lot dont la source a Ã©tÃ© purgÃ©e n'Ã©tait clos par rien** â€”
      `sync_reward_issuance` Ã©crit `null` en Ã©chÃ©ance pour sept familles sur
      neuf, et la protection posÃ©e la veille n'avait pas de terme : la ligne
      n'Ã©tait terminale pour aucune branche du prÃ©dicat de purge, donc
      **jamais supprimÃ©e**, alors qu'elle porte un `player_id`. FermÃ© par un
      **dÃ©lai de grÃ¢ce** (migration `20260903120000`, ADR-071) : la ligne
      n'est plus encaissable dÃ¨s que sa source disparaÃ®t, sa seule valeur
      restante est d'**expliquer**, et une explication a une Ã©chÃ©ance â€”
      **bornÃ©e** par `least(3 mois, fenÃªtre de rÃ©tention de l'organisation)`,
      courant depuis `cancelled_at` et ANDÃ©e au critÃ¨re d'Ã¢ge.
- [x] **`loadHuntStepContext` n'Ã©tait bornÃ© par rien, et le seau bloquant est
      REFUSÃ‰ â€” la revue a confirmÃ© ce refus** â€” le jeton d'Ã©tape est sur un QR
      de vitrine (un seau dessus ferme la chasse Ã  tout le lieu) et le cookie
      n'existe pas au premier scan, or le premier scan **est** le produit : le
      seau aurait siÃ©gÃ© sur la seule route que l'abuseur ne prend jamais. Ã€ la
      place, le coÃ»t public est **mesurÃ©** â€” 3 lectures `service_role` sans
      cookie, 4 avec un cookie arbitraire, 6 pour un joueur retrouvÃ© ; les
      documents annonÃ§aient Â« ~4 Â» sans que personne ait comptÃ© â€” et un
      `observeSharedKey` sur l'IP rend l'amplification visible **sans jamais
      rien refuser** (ADR-073).
- [x] **Deux gardes ne prouvaient pas ce qu'on croyait** â€”
      `player-identity-coverage.test.ts` Ã©tait **textuelle** : un `void 0 &&`
      la laissait verte. Elle est conservÃ©e (elle se dÃ©rive du dossier, donc un
      cinquiÃ¨me module d'offre y arrive tout seul) et complÃ©tÃ©e par un test qui
      **exÃ©cute** les quatre chemins de tour offert ; **l'Ã©cart entre les deux
      fichiers EST la dÃ©monstration** â€” 4 rouges contre 0 sur le mÃªme sabotage
      (ADR-074). Et les deux littÃ©raux SQL sont dÃ©sormais vÃ©rifiÃ©s dans
      `pg_proc`, pas dans un fichier de migration.

**Revue sÃ©curitÃ© â€” GO** : 0 CRITIQUE, 0 Ã‰LEVÃ‰, 4 MOYEN, 2 FAIBLE, 3 INFO, tous
corrigÃ©s. Les quatre MOYEN portent tous sur le travail de ce chantier, pas sur
du code ancien.

- **ADR-069 retournÃ©e contre elle-mÃªme** : la cause d'annulation se dÃ©rivait de
  `cancelled_reason`, **le champ de texte libre du commerÃ§ant** que cette mÃªme
  ADR disait ne pas publier. Un `editor` saisissant exactement `source purgÃ©e`
  â€” au formulaire ou par un `PATCH` PostgREST qui ne passe mÃªme pas par
  l'audit â€” faisait dire au caissier, au client en face, Â« ce n'est une
  dÃ©cision de personne Â». FermÃ© par une colonne dÃ©diÃ©e `cancelled_source`,
  fiable **non par un contrÃ´le mais par une absence** : aucun chemin
  applicatif ne la nomme (ADR-072).
- **Les deux appuis chiffrÃ©s du dÃ©lai Ã©taient faux**, et gravÃ©s dans un
  `comment on function` : `contests.code_ttl_seconds` est nullable (Â« sans
  limite Â») et les sept familles concernÃ©es n'ont aucune Ã©chÃ©ance ; le
  `<select>` 12/24/36 mois est du **client**, la frontiÃ¨re serveur accepte
  1 mois â€” trois mois y auraient Ã©tÃ© le **triple** de la rÃ©tention. Appuis
  retirÃ©s, trois mois assumÃ© comme arbitrage produit, la **borne** seule
  Ã©noncÃ©e (ADR-071).
- **ADR-032 citÃ©e Ã  contresens** : Â« l'IP est proscrite Â» â€” l'ADR proscrit le
  **refus** sur une clÃ© partagÃ©e et **prescrit** Ã  la place un compteur large
  et fail-open, que le dÃ©pÃ´t implÃ©mentait dÃ©jÃ  deux fonctions plus loin. Le
  raisonnement sautait le terme moyen, et ce saut a laissÃ© la page sans mesure
  pendant quatre chantiers (ADR-073).
- **La grÃ¢ce va au collatÃ©ral, jamais Ã  la dÃ©cision** : elle est Ã©tendue Ã 
  `source_deleted` sur un motif **factuel** et non d'Ã©quitÃ© â€” avant la
  migration de la veille, la disparition de la source laissait la ligne non
  terminale, donc jamais purgÃ©e, **pour les deux causes** ; l'asymÃ©trie
  suivait le contour du risque nommÃ© par la revue prÃ©cÃ©dente, pas un principe.

**Reste ouvert, Ã©crit et non refermÃ©** : `WheelResult` et `ContestResult`
rendent encore Â« annulÃ© Â» sans cause ; les sept familles sans Ã©chÃ©ance le
restent pour les lots **non annulÃ©s**, que rien ne clÃ´t jamais ;
`clientIpFromHeaders` rend `"unknown"` hors proxy dÃ©clarÃ©, donc le nouveau
compteur ne mesure quelque chose que lÃ  oÃ¹ `TRUSTED_PROXY_PROVIDER`/`VERCEL`
est posÃ© (fail-open, inoffensif, mais un zÃ©ro n'est pas une absence d'abus) ;
le repli `merchant` est **indistinguable** entre Â« annulation Ã  la main Â» et
Â« cause illisible Â», alignement dÃ©libÃ©rÃ© entre caisse et portefeuille ; le
calibrage du compteur (200 / 10 min) est **hÃ©ritÃ© sans mesure propre** Ã  cette
page ; et `cancelled_reason` porte toujours les deux sentinelles, qui ne
dÃ©cident plus rien mais restent un texte imitable.

**Enseignement de mÃ©thode, qui prolonge celui des trois chantiers prÃ©cÃ©dents** :
deux dÃ©tecteurs muets de plus, et **ce sont les VERTS qui les ont dÃ©masquÃ©s** â€”
cumul **onze** occurrences sur les cinq derniers chantiers, avec onze causes
toutes diffÃ©rentes. Les deux nouvelles : un `psql -f /mnt/c/â€¦` exÃ©cutÃ© **dans**
le conteneur, oÃ¹ ce chemin n'existe pas (0 rouge **ET** 0 vert â€” c'est le zÃ©ro
vert qui a parlÃ©) ; et un `perl -0777` qui n'a pas mordu, rendant exactement la
ligne de base, indistinguable d'un correctif inutile. **Second point, neuf** :
QA n'a pas reproduit un chiffre annoncÃ© par un agent (4 rouges au lieu de 7) et
**l'a dit plutÃ´t que de l'arrondir** ; le sabotage exact n'Ã©tant pas dÃ©crit, la
preuve n'Ã©tait pas rejouable. D'oÃ¹ la rÃ¨gle ajoutÃ©e : **un contrÃ´le nÃ©gatif se
rapporte avec son protocole** â€” quel sabotage, sur quelle ligne â€” pas seulement
avec son rÃ©sultat.

**Preuve** : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build vert
(Windows), **163 fichiers / 2818 tests**, test:sql 12/12, migrations:check
**107 fichiers, head `20260903120000`**, test:migrations 9/9, sql:check OK,
pgTAP **43 fichiers / 2669 assertions PASS, base vide ET semÃ©e**,
`database.generated.ts` rÃ©gÃ©nÃ©rÃ© en `--local` avec un diff de 0 ligne, `ci.yml`
croisÃ© dans les deux sens (43/43, aucun orphelin). **Seul trou : les E2E n'ont
pas Ã©tÃ© exÃ©cutÃ©s** â€” ils figent WSL ; la branche ne modifie aucun fichier de
`e2e/` et aucun spec n'asserte de cause d'annulation (vÃ©rifiÃ© par balayage),
mais ce n'est pas une exÃ©cution. La CI tranchera.

## V1.29 â€” Un lot dont la source disparaÃ®t est ANNULÃ‰, jamais effacÃ© â€” quatre rÃ©sidus soldÃ©s sur six (âœ… 2026-08-03, branche `chantier/residus-chasse`)
**Objectif** : fermer les rÃ©sidus que le chantier prÃ©cÃ©dent avait consignÃ©s
ouverts (docs/bugs.md). Six entrÃ©es, **quatre fermÃ©es** ; les deux restantes
sont des **dÃ©cisions** et non des dettes, reformulÃ©es comme telles.

- [x] **Le portefeuille du client cesse de promettre un lot que la caisse
      refuse** â€” les dix triggers de miroir du registre Ã©taient
      `after insert or update`, jamais `delete` : une source supprimÃ©e laissait
      sa ligne de registre orpheline, Â« Ã€ retirer Â» sur `/portefeuille` et
      Â« Code introuvable Â» au comptoir. Migration `20260902120000`, arbitrage
      **marquer plutÃ´t que dÃ©truire** (ADR-068) : l'Ã©tat `cancelled` existait
      dÃ©jÃ  de bout en bout, donc le client lit une explication au lieu de
      constater une disparition, et le rapport du lundi ne voit pas le chiffre
      d'une semaine passÃ©e baisser aprÃ¨s coup.
- [x] **La rÃ©tention ne parle plus au nom du commerÃ§ant, et ne dÃ©truit plus un
      lot qu'elle vient d'annuler** â€” les deux MOYEN de la revue sÃ©curitÃ©,
      tous deux **consÃ©quences non dÃ©clarÃ©es de la migration elle-mÃªme**. La
      purge RGPD supprime sur le seul critÃ¨re d'Ã¢ge : le nouveau trigger la
      transformait en annulateur de masse, une ligne annulÃ©e Ã©tant purgeable
      la nuit mÃªme alors qu'elle Ã©tait protÃ©gÃ©e Ã  vie avant. Et un motif unique
      pour trois causes aurait fait affirmer Ã  un caissier, **au client en
      face**, que son patron avait supprimÃ© l'opÃ©ration. Cause normalisÃ©e Ã 
      vocabulaire fermÃ© (ADR-069) â€” pas le `cancelled_reason` libre, Ã©cartÃ©
      aprÃ¨s vÃ©rification : c'est du texte saisi par le commerÃ§ant.
- [x] **La caisse distingue Â« annulÃ© Â» d'Â« introuvable Â»** â€” `routeRedeemCode`
      rendait `null` sans jamais atteindre `tryUniversalRedeem` : le bon
      message existait, il n'Ã©tait pas atteint, et un vrai gagnant recevait le
      mÃªme refus qu'un code inventÃ©.
- [x] **Un lot de roue gagnÃ© par un TOUR OFFERT rejoint son portefeuille** â€”
      le pont d'identitÃ© `campaign` n'Ã©tait posÃ© par personne. Il est relu
      **sur le spin**, jamais sur l'appelant : mÃªme source que celle que le
      miroir interrogera (ADR-066, Consequences corrigÃ©es).
- [x] **Le pont d'identitÃ© cesse d'Ãªtre muet, et le rappel de chasse est
      bornÃ©** â€” traces sur les quatre sorties en Ã©chec, **Ã©touffÃ©es par
      fenÃªtre et par cause** (sans quoi une panne gÃ©nÃ©rale produisait un
      Ã©vÃ©nement Sentry et un `insert` `ops_metrics` par requÃªte joueur) ; trois
      gardes sur `loadHuntRecallContext`, dont un seau dÃ©libÃ©rÃ©ment
      `failClosed: false` â€” fermer ce chemin sur une panne d'infrastructure
      rendrait une chasse close **moins** accessible qu'une chasse ouverte, au
      moment prÃ©cis oÃ¹ son seul recours est cette page (ADR-070).

**Revue sÃ©curitÃ© â€” GO, rÃ©serves levÃ©es** : 0 CRITIQUE, 0 Ã‰LEVÃ‰, 2 MOYEN,
4 FAIBLE, 3 INFO, tous corrigÃ©s.

**Reste ouvert, Ã©crit et non masquÃ©** : sept familles sur neuf n'ont aucune
expiration au registre, donc un lot annulÃ© par purge y est conservÃ©
indÃ©finiment (restauration du comportement d'avant, mais rien ne clÃ´t jamais
ces lignes) ; `loadHuntStepContext` reste non bornÃ© sur la mÃªme page, ce qui
relativise le seau posÃ© ; le seau `huntRecall` ne borne qu'un porteur
coopÃ©ratif, sa clÃ© Ã©tant un cookie que le porteur contrÃ´le â€” la phrase a Ã©tÃ©
corrigÃ©e plutÃ´t qu'une fausse garde ajoutÃ©e ; `WheelResult` et `ContestResult`
rendent Â« annulÃ© Â» sans cause ; et **deux gardes ne prouvent pas ce qu'on
croit** (la garde des littÃ©raux SQL compare au fichier de migration et jamais Ã 
`pg_proc` ; `player-identity-coverage.test.ts` est textuelle â€” QA a neutralisÃ©
un appel par `void 0 &&` sans la faire rougir).

**Enseignement de mÃ©thode, qui prolonge celui du 2026-08-02** : deux contrÃ´les
nÃ©gatifs de plus ont rendu 0 rouge sans que le code soit en cause â€” cumul de
**neuf** sur les quatre derniers chantiers. Causes nouvelles : un `perl` qui
n'avait pas mordu sur une ligne accentuÃ©e (deux fois), et un **dÃ©tecteur muet**
(`psql` sans `-t -A`, rendant 0 en ligne de base comme aprÃ¨s sabotage). D'oÃ¹ la
pratique adoptÃ©e : **compter les VERTS autant que les rouges** â€” c'est le
compte des verts qui distingue Â« le correctif est inutile Â» de Â« le dÃ©tecteur
ne mesure rien Â». Second point : ne pas faire tourner QA et la revue sÃ©curitÃ©
en parallÃ¨le, la revue ayant observÃ© dans l'arbre des marqueurs `SABOTAGE`
transitoires.

**Preuve** : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build vert
(Windows), 162 fichiers / 2795 tests, test:sql 12/12, migrations:check
106 fichiers, test:migrations 9/9, sql:check OK, pgTAP 43 fichiers /
2649 assertions PASS (base vide ET semÃ©e), `database.generated.ts` rÃ©gÃ©nÃ©rÃ© en
`--local` avec un diff de 0 ligne. **Les E2E n'ont pas Ã©tÃ© exÃ©cutÃ©s** (ils
figent WSL) â€” la branche ne touche aucun fichier de `e2e/` et aucun spec
n'asserte de texte d'annulation, mais ce n'est pas une exÃ©cution : la CI
tranchera. Seul trou du chantier.

## V1.28 â€” Chasse par parcours vÃ©cu : 19 dÃ©fauts fermÃ©s, dont six gestes d'entretien qui dÃ©truisaient des codes en main (âœ… 2026-08-02, branche `chantier/chasse-parcours`)
**Objectif** : cinq parcours vÃ©cus balayÃ©s (joueur/roue, joueur/autres modules,
caisse, socle commerÃ§ant, Ã©diteurs), rÃ¨gle d'admission stricte Â« il fait X, il
attend Y, il obtient Z Â», puis rÃ©futation adversariale de chaque trouvaille.
102 pistes examinÃ©es, 20 retenues, **19 confirmÃ©es et fermÃ©es, 1 rÃ©futÃ©e**. Le
rapport de chasse complet â€” preuves et motifs de rÃ©futation â€” est conservÃ© tel
quel dans `docs/chasse-parcours-2026-08-02.md`.

- [x] **Six gestes d'entretien ne dÃ©truisent plus les codes qu'un client tient
      en main** â€” suppression d'une roue, d'une chasse, d'un calendrier, d'un
      quiz, d'un palier et d'un programme de fidÃ©litÃ© cascadaient en silence
      sur les codes Ã©mis et non retirÃ©s. Chacune reÃ§oit la garde dÃ©jÃ  Ã©crite un
      cran au-dessus pour la campagne : compter les codes en attente, refuser
      tant que la case n'est pas cochÃ©e, **et nommer le chiffre**. DÃ©cision de
      comptage et de refus extraite dans `src/lib/codes-en-attente.ts`
      (ADR-063) ; les six entrent au registre
      `destructive-confirm-coverage.test.ts`.
- [x] **Le stock d'un lot n'est plus recrÃ©ditÃ© par une correction de coquille**
      â€” `prizes.stock` est le RESTANT ; toute sauvegarde de la ligne le
      rÃ©Ã©crivait Ã  sa valeur d'il y a une heure. Compare-and-swap sous tÃ©moin
      `stock_seen` de ce que le champ AFFICHAIT (ADR-065).
- [x] **La description d'un lot Ã©mis est gravÃ©e comme son libellÃ© l'est depuis
      `20260814120000`** â€” migration `20260901120000_freeze_reward_details.sql`,
      gel de la seule clÃ© `reward_details` de `metadata`, sur la VALEUR et non
      sur la prÃ©sence de la clÃ© (ADR-064). En attendant qu'elle soit appliquÃ©e,
      la caisse retire la description plutÃ´t que d'en afficher une pÃ©rimÃ©e.
- [x] **Le joueur retrouve son gain** â€” reprise de gain Ã©crasÃ©e sur la roue
      (seul des quatre parcours Ã  n'avoir jamais reÃ§u la correction du
      2026-07-29) ; claim non idempotent (une coupure rÃ©seau aprÃ¨s le commit
      privait le joueur de son code Ã  jamais â€” le rejeu rend dÃ©sormais le code
      dÃ©jÃ  Ã©mis, ADR-067) ; SMS de code de retrait jamais envoyÃ© au premier
      gain d'un couple (organisation, numÃ©ro) ; code de chasse perdu Ã  la fin
      de la fenÃªtre ; pont d'identitÃ© posÃ© pour pronostics et parrainage, les
      deux familles qui manquaient au portefeuille et aux missions de saison
      (ADR-066).
- [x] **La caisse dit ce qu'elle sait** â€” le badge vert de confirmation est
      attachÃ© au GESTE (`?remis=1`) et non Ã  l'horloge : un second porteur d'un
      code consommÃ© depuis moins de 90 s recevait l'ordre de servir un
      deuxiÃ¨me lot ; refus de caisse datÃ© au fuseau de l'Ã©tablissement et non Ã 
      celui du serveur.
- [x] **Les Ã©crans cessent de renvoyer sur un mur** â€” Â« Voir les offres Â» et
      Â« Gains Ã  valider Â» ne sont plus des liens pour un `editor` (rÃ¨gle portÃ©e
      par la DESTINATION, `src/lib/liens-proprietaire.ts`) ; Â« votre essai
      gratuit est terminÃ© Â» n'est plus dit Ã  un rÃ©siliÃ© ; la ligne Â« Essai
      gratuit : 7 jours Â» n'est plus affichÃ©e Ã  un abonnÃ© ; un checkout refusÃ©
      ouvre le portail qu'il nomme au lieu de renvoyer vers un bouton absent ;
      la duplication d'une campagne emporte enfin son plafond de dÃ©pense.

**Revue sÃ©curitÃ© â€” GO sous rÃ©serve, rÃ©serves levÃ©es le jour mÃªme** : 1 Ã‰LEVÃ‰,
3 MOYEN, 2 FAIBLE, 4 INFO, tous corrigÃ©s. L'Ã‰LEVÃ‰ portait sur les correctifs
eux-mÃªmes : la garde de suppression de roue comptait les participations avec le
client RLS, dont la policy de lecture est owner-only, alors que l'action laisse
un `editor` agir â€” pour lui la garde rendait Â« aucun code Â», donc aucune case et
aucun chiffre, et la suppression passait en silence. **Le propriÃ©taire, lui,
voyait le refus** : le dÃ©faut Ã©tait invisible Ã  qui ne teste qu'avec un compte
owner (ADR-063).

**La trouvaille rÃ©futÃ©e, consignÃ©e pour ne pas la rouvrir** :
`meta-progression-invisible-hors-roue` â€” le fait est exact, la qualification ne
l'est pas : c'est une limitation dÃ©cidÃ©e (ADR-044) et dÃ©jÃ  portÃ©e par l'item
Â« Ã‰tendre la visibilitÃ© du panneau joueur Â» ci-dessous, auquel un seul Ã©lÃ©ment
neuf est versÃ©.

Preuve : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build vert
(Windows), **161 fichiers / 2741 tests**, test:sql 12/12, migrations:check
105 fichiers (head `20260901120000`, `EXPECTED_MIGRATION` synchronisÃ©e),
test:migrations 9/9, sql:check OK, pgTAP **42 fichiers / 2609 assertions PASS**
(base vide ET semÃ©e). **Le seul trou rÃ©el : les E2E n'ont pas Ã©tÃ© exÃ©cutÃ©s** â€”
ils figent WSL sous la charge (piÃ¨ge 9 de CLAUDE.md) ; c'est la CI qui
tranchera. Reste ouvert : voir docs/bugs.md (portefeuille sans jointure source,
pont d'identitÃ© d'un tour offert, `loadHuntRecallContext` sans rate-limit,
reprise dÃ©terministe sur appareil partagÃ©, pannes d'identitÃ© avalÃ©es, rejeu sans
renvoi comptÃ© et non rÃ©Ã©mis). ADR-063 Ã  ADR-067.

## V1.27 â€” Activer la cadence rapide de la file en un clic, sans manipuler `CRON_SECRET` (âœ… 2026-08-01, branche `chantier/cadence-file`, commits `f7aa3fd`, `fe36d6b`)
**Objectif** : le point Â§5bis de `docs/production-readiness.md` demandait au
propriÃ©taire de poser Ã  la main deux secrets Vault (`jobs_worker_url`,
`sync_contests_secret`) pour faire passer la file de jobs SMS d'un passage
quotidien Ã  un passage toutes les 5 minutes. Poser `jobs_worker_url` exige de
recopier `CRON_SECRET` â€” un secret d'exploitation qui n'a aucune raison de
transiter par un presse-papier humain.

- [x] **Action `enableWorkerFastCadence`** â€” lit `CRON_SECRET` et l'URL de
      l'application dans son propre environnement serveur (jamais depuis le
      client) et les dÃ©pose au Vault via RPC. Permission dÃ©diÃ©e
      `monitoring.cadence`, super_admin seul, `requireFresh`, refus tracÃ©.
      URL refusÃ©e si non-https ou si elle dÃ©signe un hÃ´te local/privÃ©
      (loopback, `10/172.16-31/192.168/169.254`, `.local`) â€” module pur
      `src/lib/admin/worker-cadence.ts`. Le secret n'apparaÃ®t dans aucune
      sortie (journal, erreur) : seul le SQLSTATE Postgres est journalisÃ©.
- [x] **Panneau Â« Cadence des workers Â»** (`/admin/monitoring`) â€” pilotÃ© par
      le registre `ops_worker_definitions`, pas par des chiffres recopiÃ©s ;
      trois Ã©tats (quotidienne / 5 minutes / inconnue si non supervisÃ©) ;
      dit la consÃ©quence produit (dÃ©lai du code de retrait SMS) plutÃ´t
      qu'un drapeau technique ; ni URL ni secret ni nom d'entrÃ©e Vault ne
      transitent jusqu'Ã  l'Ã©cran.
- [x] **RPC d'Ã©criture au Vault** (`set_worker_vault_secrets`, migration
      `20260831120000_worker_vault_write.sql`) â€” n'Ã©crit que dans les deux
      entrÃ©es Vault que le registre `ops_worker_definitions` dÃ©signe pour
      le worker demandÃ© ; un refus prÃ©visible (worker inconnu, prÃ©requis
      Vault absents, valeur vide) est rendu comme statut, jamais levÃ©, pour
      ne pas imprimer `CRON_SECRET` dans les journaux Postgres â€” seul le
      refus d'autorisation lÃ¨ve. `also_affects_workers` nomme le worker
      voisin dont l'entrÃ©e Vault est partagÃ©e. Reste requis, hors code : la
      migration doit Ãªtre **appliquÃ©e en production**, puis le bouton doit
      encore Ãªtre **cliquÃ©** par le propriÃ©taire â€” tant que l'un des deux
      n'a pas eu lieu, la file continue de tourner une fois par jour. Voir
      `docs/production-readiness.md` Â§5bis.

Preuve (lot RPC + backend + Ã©cran) : typecheck 0, lint 0, casts:check OK,
test:casts OK, build vert, npm test 146 fichiers / 2516 tests, pgTAP (WSL)
41 fichiers / 2592 assertions PASS (base vide et semÃ©e), migrations:check
OK, test:migrations 9/9, sql:check OK. Revue sÃ©curitÃ© de la RPC (lecture
seule, HEAD `1d30c6b`) : GO, 0 CRITIQUE, 0 Ã‰LEVÃ‰, 1 MOYEN (rien n'empÃªche
d'armer la cadence depuis un dÃ©ploiement non-production â€” correctif
proposÃ©, non livrÃ©), 4 INFO. ADR-062 (et addendum).

- [x] **Fermeture du MOYEN, mÃªme jour, mÃªme branche** (commits `b97f344`,
      `4bfa714`, `8c87128`) â€” `checkCadenceEnvironment` (module pur) refuse
      d'armer si `VERCEL_ENV â‰  production` (absente = refus) et compare
      l'hÃ´te de `NEXT_PUBLIC_APP_URL` Ã  `VERCEL_PROJECT_PRODUCTION_URL`
      quand Vercel l'expose, seul angle attrapant une `APP_URL` pÃ©rimÃ©e sur
      une vraie production ; placÃ©e aprÃ¨s la garde d'URL pour que le
      message le plus prÃ©cis gagne. Ce qu'elle ne couvre pas
      (`VERCEL_PROJECT_PRODUCTION_URL` non vÃ©rifiÃ©e Ã  l'exÃ©cution sur ce
      projet) est rendu Ã  l'audit (`production_host_verified`), pas cachÃ©.
      Au passage : la justification d'origine du refus Â« rendu, jamais
      levÃ© Â» (fuite de `CRON_SECRET` dans les journaux Postgres) Ã©tait
      **fausse** â€” mesurÃ©e (`log_parameter_max_length_on_error = 0`) et
      corrigÃ©e aux quatre endroits qui la portaient ; le design est gardÃ©
      pour une raison diffÃ©rente (un refus prÃ©visible n'a rien Ã  faire dans
      un journal d'erreur). Et l'avertissement prÃ©-clic du panneau
      sous-dÃ©clarait le worker voisin dont l'entrÃ©e Vault partagÃ©e est
      aussi rÃ©Ã©crite (`ops.ts` filtrait par `vault_url_secret` seul) â€”
      filtre retirÃ©. Deux contrÃ´les nÃ©gatifs jouÃ©s : garde d'environnement
      neutralisÃ©e â†’ 14 rouges, filtre rÃ©introduit â†’ 2 rouges. Preuve :
      typecheck 0, lint 0, build vert, 146 fichiers / 2537 tests, pgTAP 41
      fichiers / 2592 assertions PASS (base vide et semÃ©e). ADR-062
      (second addendum), docs/bugs.md, docs/production-readiness.md.

**CorrigÃ© le 2026-08-02 â€” la prÃ©misse de ce chantier Ã©tait fausse,
mesurÃ©e et non dÃ©duite.** La sonde `production-health.yml` (commit
`46c33dc`, 17h36 UTC) prouve que le worker `jobs` rÃ©pondait dÃ©jÃ 
`healthy` avec un battement infÃ©rieur Ã  15 min alors que le seul filet
Vercel passe Ã  04h20 UTC, treize heures plus tÃ´t : les deux secrets
Vault existaient dÃ©jÃ  en production et `lastchance-jobs-worker` tournait
dÃ©jÃ  toutes les 5 minutes avant l'ouverture de ce chantier. Le panneau
livrÃ© n'est donc pas un dÃ©blocage mais une **rotation** par-dessus une
configuration qui fonctionne â€” le risque s'inverse, un mauvais armement
casse une file qui tourne plutÃ´t que d'en dÃ©bloquer une inerte. ADR-062
(troisiÃ¨me addendum), docs/bugs.md, docs/production-readiness.md Â§5bis
(le geste de pose des secrets Vault est retirÃ© de la liste des choses Ã 
faire).

## V1.26 â€” Solder les ouverts : 27 affirmations relues contre le code vivant (âœ… 2026-08-01, branche `chantier/solder-les-ouverts`, commit `ff8a722`)
**Objectif** : pas une nouvelle fonctionnalitÃ© â€” vÃ©rifier, une par une, les
affirmations laissÃ©es Â« ouvertes Â» ou Â« gÃ©antes Â» par les audits prÃ©cÃ©dents
(surtout l'audit `router.refresh` du 2026-07-30) contre le code rÃ©ellement en
place, corriger ce qui l'Ã©tait encore, et refermer ce que la documentation
avait laissÃ© traÃ®ner comme ouvert alors que le code l'avait dÃ©jÃ  fermÃ©.
**C'est la quatriÃ¨me fois que ce dÃ©pÃ´t paie cette forme de dette** (voir
docs/bugs.md, section Notes).

- [x] **9 confirmÃ©es, corrigÃ©es** â€” 7 bascules d'Ã©tat sans `reloadOnSuccess`
      sur des surfaces rÃ©ellement ouvertes (statut de championnat, module
      calendrier au back-office, suspension d'un commerÃ§ant, modÃ©ration d'un
      joueur en direct, remise de rÃ©compense pronostics, rÃ©sultat de
      match/question), plus deux corrections documentaires (un gain de
      23 h 30 ne part pas instantanÃ©ment â€” il reste soumis au cron
      quotidien ; la mention STOP sans numÃ©ro court a bien un correctif de
      code depuis PR #82, contrairement Ã  ce que docs/bugs.md affirmait).
      Garde mÃ©canique ajoutÃ©e : `src/lib/use-action-form-bascule.test.ts`
      (14 bascules, 5 contrÃ´les nÃ©gatifs).
- [x] **15 affirmations dÃ©jÃ  closes** par des chantiers antÃ©rieurs sans que
      ce dÃ©pÃ´t l'ait enregistrÃ© â€” 9 bascules qui portaient dÃ©jÃ 
      `reloadOnSuccess`, les deux rÃ©ordonnancements (quiz, chasse, fermÃ©s le
      2026-07-30 par `src/lib/ordre-optimiste.ts`), l'artefact d'axe sur
      `/play`, les couleurs libres, le jeton du kicker.
- [x] **3 affirmations fausses dÃ¨s l'origine** â€” le doublon de ligue
      (`contest-leagues.tsx`, le rÃ©sultat est portÃ© par `state`, pas par un
      rafraÃ®chissement), l'exemple ambre choisi pour illustrer les couleurs
      hostiles (il passe le seuil, recalculÃ©), et l'affirmation que le SMS
      facture toujours 1 crÃ©dit par envoi (fermÃ© depuis ADR-058).
- [ ] **Reste ouvert, sans changement** : les 32 Â« gÃªnants Â» de l'audit
      d'origine n'ont eu qu'une seule passe sans rÃ©futation ; aucun taux
      d'Ã©chec n'a Ã©tÃ© mesurÃ© hors du module progression.

Preuve : typecheck 0, lint 0, casts:check OK, test:casts 4/4, build Windows
OK, migrations:check 103 fichiers, test:migrations 9/9, sql:check OK,
test:sql 12/12, 143 fichiers / 2422 tests unitaires. DÃ©tail : docs/bugs.md.

## V1.25 â€” Rendre le canal SMS rÃ©ellement utilisable (âœ… 2026-08-01, branche `feat/canal-sms-utilisable`)
**Objectif** : corriger ce que V1.24 avait de trop gÃ©nÃ©reux â€” le canal SMS
livrÃ© n'avait **aucun appelant** pour ses quatre RPC d'expÃ©diteur, donc
`sms_sender_for_send` rendait toujours `null` et aucun SMS ne pouvait
partir. DocumentÃ© ici sans l'adoucir : une documentation qui dÃ©crit une
capacitÃ© que le code n'a pas encore est exactement le dÃ©faut que ce dÃ©pÃ´t a
dÃ©jÃ  corrigÃ© trois fois.

- [x] **Le canal Ã©tait inerte, maintenant il ne l'est plus** â€” deux surfaces
      manquantes ajoutÃ©es : l'Ã©cran commerÃ§ant `/dashboard/settings/sms`
      (demande d'expÃ©diteur, solde, grand livre, packs Stripe) et le panneau
      back-office (dÃ©claration AF2M, refus/suspension, crÃ©dit manuel). Sans
      elles, `declare_sms_sender` n'Ã©tait jamais appelÃ©e
- [x] **Le multi-segment, tranchÃ©** â€” le grand livre dÃ©bite dÃ©sormais ce que
      Brevo facture rÃ©ellement, pas un forfait d'une unitÃ© par message
      (ADR-058). `smsSegments()` calcule cÃ´tÃ© serveur, dans la mÃªme
      transaction que la rÃ©servation ; `sms.segment_mismatch` rend
      l'hypothÃ¨se mesurable plutÃ´t que prÃ©sumÃ©e
- [x] **Achat de crÃ©dits en libre-service** â€” packs Stripe (100/500/2000),
      catalogue pilotÃ© par variables d'environnement, un pack sans variable
      n'est pas proposÃ© plutÃ´t que d'Ã©chouer au clic. Webhook
      `checkout.session.completed` crÃ©dite via `credit_sms_balance`,
      idempotent par l'entrÃ©e dÃ©jÃ  prise dans `stripe_events`
- [x] **NumÃ©ro court du STOP, nommable** â€” `SMS_STOP_SHORTCODE` optionnelle ;
      posÃ©e, le texte de consentement le cite ; absente, comportement
      inchangÃ© (le compte Brevo n'est pas encore ouvert)
- [x] **Revue sÃ©curitÃ©, puis correctifs** â€” 0 CRITIQUE, 2 Ã‰LEVÃ‰, 2 MOYEN,
      3 INFO trouvÃ©s en lecture seule ; les 2 Ã‰LEVÃ‰ et les 2 MOYEN
      **corrigÃ©s le mÃªme jour** (migration `20260828120000_sms_findings.sql`,
      commits `9f9cc3f`, `088daf2`) â€” voir `docs/bugs.md` et ADR-059. Une
      contre-revue des correctifs a trouvÃ© 4 rÃ©sidus (un contournement par
      changement de nom, une sanction qui redevient invisible aprÃ¨s
      retrait, un crÃ©dit back-office non fidÃ¨le sur doublon, aucune
      fenÃªtre horaire lÃ©gale sur les SMS) â€” **3 clos au troisiÃ¨me tour**,
      voir ci-dessous.
- [x] **TroisiÃ¨me tour, sur contre-revue** (2026-08-01, commits `301d04f`,
      `05754be`, `5bfe506`) â€” la sanction porte dÃ©sormais sur le droit
      d'Ã©mettre d'une **organisation**, pas sur un nom d'expÃ©diteur
      (migration `20260829120000`) : redemander sous un autre nom, ou
      relever une suspension via le formulaire de dÃ©claration, sont
      refusÃ©s. Un expÃ©diteur `suspended` puis `retired` reste affichÃ©
      comme sanctionnÃ© sur les deux Ã©crans (`sms-sender-state.ts`) au lieu
      de redevenir un no-op muet. Les deux appelants de
      `credit_sms_balance` lisent dÃ©sormais `created` et distinguent un
      crÃ©dit d'un rejeu, en base (signature change en
      `(entry_id, created)`) et Ã  l'Ã©cran (ambre, pas vert). **TrouvÃ© au
      passage, par la mesure et non l'hypothÃ¨se** : la file de jobs tourne
      une fois par jour (`vercel.json`), pas toutes les 5 minutes comme
      sept commentaires l'affirmaient â€” un code de retrait peut arriver
      jusqu'Ã  24h aprÃ¨s le gain ; la fenÃªtre horaire lÃ©gale posÃ©e dans un
      module pur (`src/lib/sms-window.ts`, ADR-060) s'applique dÃ©sormais
      dans le worker avant tout dÃ©bit. La question laissÃ©e ouverte â€”
      fenÃªtre sans distinction de nature du message â€” est tranchÃ©e au
      quatriÃ¨me tour ci-dessous.
- [x] **QuatriÃ¨me et dernier tour** (2026-08-01, commits `31268a0`,
      `76b257f`, `e432b20`) â€” trois lots. **SQL** : le trigger de
      renommage d'expÃ©diteur protÃ©geait dÃ©jÃ  le registre
      (`declared â†’ pending`) mais pas la sanction â€” renommer un
      expÃ©diteur `suspended` le laissait retomber en `pending`, levant la
      suspension sans qu'aucun humain ne l'ait dÃ©cidÃ©e ; garde posÃ©e sur
      `old.status = 'suspended' or new.status = 'suspended'`
      (migration `20260830120000`). **Backend** : le code de retrait
      devient **transactionnel** (`marketing: false`, ADR-061) â€” la
      question laissÃ©e ouverte au troisiÃ¨me tour est tranchÃ©e par le
      client, un gain de 23h30 part Ã  23h30 ; un report de fenÃªtre pour un
      futur SMS publicitaire devient un Ã©tat `deferred` qui ne consomme
      plus le budget de reprise des pannes (plafond d'Ã¢ge 7 jours) ; les
      lignes `sms_log` figÃ©es en `sending` au-delÃ  de 24h sont dÃ©sormais
      comptÃ©es (`sms.stale_sending`), jamais remboursÃ©es automatiquement â€”
      on ne sait pas si Brevo a reÃ§u. **Ã‰crans** : le bandeau
      `/dashboard/settings/sms` distingue enfin Â« aucun expÃ©diteur
      utilisable Â» (rouge) de Â« les SMS partent malgrÃ© une suspension
      ailleurs Â» (ambre) ; le dÃ©lai d'attente affichÃ© est bornÃ© aux 7 jours
      rÃ©els plutÃ´t que Â« n'est pas perdu Â».

**Preuve (troisiÃ¨me tour)** : pgTAP base vide et semÃ©e, 40 fichiers /
2 543 assertions PASS ; npm test 142 fichiers / 2 384 tests PASS ;
typecheck 0 ; lint 0 ; build vert. Trois contrÃ´les nÃ©gatifs jouÃ©s :
fuseau remplacÃ© par UTC (4 rouges), garde horaire dÃ©sarmÃ©e (3 rouges),
`created` forcÃ© Ã  vrai chez les deux appelants (2 rouges), garde de
sanction retirÃ©e (8 rouges), distinction suspendu/retirÃ© supprimÃ©e
(5 rouges). Contre-revue du troisiÃ¨me tour : 0 CRITIQUE, 0 Ã‰LEVÃ‰, 2 MOYEN
(consignÃ©s `docs/bugs.md`), 10 scÃ©narios d'attaque tentÃ©s et rÃ©futÃ©s.

**Preuve (quatriÃ¨me tour)** : pgTAP 40 fichiers / 2 563 assertions PASS
(base vide et semÃ©e) ; npm test 142 fichiers / 2 409 tests PASS ;
typecheck 0 ; lint 0 ; build vert (Windows) ; `migrations:check` OK,
103 migrations. Trois contrÃ´les nÃ©gatifs jouÃ©s et restaurÃ©s : code de
retrait repassÃ© `marketing: true` (1 rouge nommÃ©), trigger de renommage
sabordÃ© et vÃ©rifiÃ© appliquÃ© dans `pg_proc` (4 rouges nommÃ©s), garde de
fenÃªtre horaire dÃ©sactivÃ©e (7 rouges). Contre-revue du quatriÃ¨me tour :
0 CRITIQUE, 0 Ã‰LEVÃ‰, 0 MOYEN, 5 INFO (texte d'Ã©cran et une confirmation
Brevo Ã  faire Ã  l'ouverture du compte) â€” GO. Le canal SMS n'a plus de
rÃ©sidu ouvert de sÃ©curitÃ© ou de fonctionnement ; les gestes restants
(compte Brevo, cron Ã  5 min) appartiennent au propriÃ©taire, voir
`docs/production-readiness.md`.

**Preuve (livraison initiale + tour 2)** : pgTAP base vide et semÃ©e,
39 fichiers / 2 487 assertions PASS ; npm test 140 fichiers / 2 339 tests
PASS ; typecheck 0 ; lint 0 ; build vert, `/dashboard/settings/sms` dans
la liste des routes. Six contrÃ´les nÃ©gatifs jouÃ©s au total (2 sur les
correctifs de sÃ©curitÃ©, 4 sur la livraison initiale â€” segments,
expÃ©diteur, deux cÃ´tÃ©s Stripe), chacun rouge prÃ©cisÃ©ment sur la propriÃ©tÃ©
visÃ©e puis restaurÃ© vert.

## V1.24 â€” Le rapport du lundi, le portefeuille du client, et le canal SMS (âœ… 2026-08-01, PR #80)
**Objectif** : trois fonctionnalitÃ©s demandÃ©es par le client, six migrations,
un canal rÃ©glementÃ© de bout en bout.

- [x] **Le rapport du lundi** â€” e-mail hebdomadaire au commerÃ§ant (joueurs,
      lots remis, panier attribuable, podium, comparaison Ã  la semaine
      prÃ©cÃ©dente). `org_prize_funnel` ne suffisait pas (roue seule, aucun
      joueur comptÃ©, aucune comparaison) ; `org_weekly_digest` lit les neuf
      familles du registre universel en un aller-retour. Seuil de la semaine
      vide **auto-limitant** : envoi seulement si la semaine Ã©coulÃ©e OU la
      prÃ©cÃ©dente porte de l'activitÃ© â€” un Â« 0/0 Â» chaque lundi tue l'e-mail,
      une chute Ã  zÃ©ro aprÃ¨s une semaine active reste l'alerte la plus utile
      de l'annÃ©e, et deux rapports vides ne peuvent jamais se suivre. Montants
      rÃ©servÃ©s aux owner/editor, garde entiÃ¨rement applicative (le cron
      appelle la RPC en `service_role`, sans rÃ´le applicatif Ã  protÃ©ger cÃ´tÃ©
      base)
- [x] **Le portefeuille du client** â€” `/portefeuille`, un lien qui rassemble
      tous les gains d'un joueur toutes familles confondues, lu depuis le
      registre universel des rÃ©compenses. **Aucun jeton dans l'URL** : la
      page lit le cookie de l'appareil qui a scannÃ©, garantie tenue par le
      compilateur (`loadPlayerWallet()`/`PortefeuillePage()` ne prennent
      aucun argument). Code de retrait jamais journalisÃ©
- [x] **Le canal SMS** â€” prestataire Brevo, crÃ©dit prÃ©payÃ© Ã  l'unitÃ©, sans
      abonnement ni expiration. ExpÃ©diteur alphanumÃ©rique â‰¤ 11 caractÃ¨res
      conforme au nom commercial dÃ©clarÃ© (charte AF2M) ; ne peut recevoir de
      rÃ©ponse, le STOP arrive par le numÃ©ro court du prestataire via route
      webhook dÃ©diÃ©e. Solde matÃ©rialisÃ© + grand livre en ajout seul
      (3 triggers, non-divergence structurelle), coÃ»t stockÃ© en micros.
      Premier producteur branchÃ© : un gagnant qui laisse son tÃ©lÃ©phone plutÃ´t
      que son e-mail reÃ§oit dÃ©sormais son code
- [x] **Le crÃ©dit ne peut pas dÃ©couvrir, prouvÃ© et non affirmÃ©** â€” sous un
      solde de 1, deux envois concurrents rendent un succÃ¨s et un refus avec
      un seul mouvement au grand livre (second appel chronomÃ©trÃ© Ã  2 174 ms,
      il a rÃ©ellement attendu le verrou) ; sous un solde de 2, les deux
      passent
- [x] **`not_enough_credits` classÃ© avant le statut HTTP** â€” Brevo rÃ©pond 400
      aussi bien pour un quota Ã©puisÃ© que pour un numÃ©ro invalide ; classÃ© sur
      le statut seul, un quota Ã©puisÃ© aurait Ã©tÃ© remboursÃ© ET interdit Ã 
      jamais de renvoi
- [x] **Normalisation E.164 en colonne calculÃ©e** â€” `0612345678` et
      `+33612345678` comptaient pour deux consentements distincts, un STOP
      sur l'un ne valait pas pour l'autre
- [x] **Sept findings de revue sÃ©curitÃ©, tous corrigÃ©s** â€” dont
      `player_wallet` qui ne vÃ©rifiait pas le joueur actif (commentaire citant
      une ligne au lieu de relire la requÃªte entiÃ¨re) et deux migrations dont
      l'en-tÃªte affirmait Ã  tort qu'Â« aucun chemin Â» ne contournait leurs
      gardes (un `delete` non couvert par les triggers dans les deux cas)
- [x] **Texte de consentement rÃ©Ã©crit une fois et une seule** â€” ne nommait ni
      le responsable du traitement ni le destinataire du STOP ; rÃ©Ã©crit sur
      place plutÃ´t qu'en `v2` car aucun consentement n'existe encore

**AssumÃ© / reste ouvert** : le multi-segment (le grand livre dÃ©bite 1 crÃ©dit,
Brevo facture par segment) ; la mention STOP sans numÃ©ro court tant que le
compte Brevo n'existe pas ; l'achat de crÃ©dits par Stripe (back-office
plateforme seul aujourd'hui) ; `BREVO_API_KEY`/`BREVO_WEBHOOK_SECRET` Ã  poser ;
le worker `weekly-digest` inscrit mais non supervisÃ© tant qu'il n'a pas un
premier succÃ¨s ; `credit_sms_balance` doit Ãªtre appelÃ©e au moins une fois pour
que le canal soit essayable.

**Constat, non technique** : la production a Ã©tÃ© mesurÃ©e pendant ce chantier â€”
1 organisation, 1 compte utilisateur, 1 participation, 4 spins, 2 lignes au
registre, abonnement en essai. C'est le compte de test du propriÃ©taire ; il
n'y a aucun commerÃ§ant rÃ©el derriÃ¨re quinze modules, plus de 2 200 tests et
99 migrations.

**Preuve** : pgTAP 37 fichiers / 2 402 assertions (base vide et semÃ©e),
137 fichiers / 2 233 tests, typecheck 0, lint 0, CI verte sur les sept
contrÃ´les.

## V1.23 â€” Les deux derniers rÃ©sidus : invitations en vol et permutation de libellÃ©s (âœ… 2026-08-01, PR #78)
**Objectif** : clore les deux derniers rÃ©sidus consignÃ©s dans `docs/bugs.md`,
dont un vrai dÃ©faut.

- [x] **Deux invitations vivantes pour la mÃªme adresse** â€” `team_invitations`
      ne porte aucune unicitÃ© sur (organisation, e-mail) ; rÃ©inviter (le
      geste naturel aprÃ¨s une erreur de rÃ´le) crÃ©ait une seconde invitation
      valide sans rÃ©voquer la premiÃ¨re. En ouvrant la plus ancienne, le
      collÃ¨gue entrait avec le rÃ´le qu'on venait de corriger.
      `inviteTeamMember` rÃ©voque dÃ©sormais les invitations non acceptÃ©es de
      la mÃªme adresse avant d'envoyer la nouvelle (mÃ©canisme `revoked_at`
      dÃ©jÃ  en place, jamais appelÃ© sur ce chemin)
- [x] **Permuter deux libellÃ©s rÃ©Ã©crivait le sens des rÃ©ponses donnÃ©es** â€”
      une rÃ©ponse enregistrÃ©e dÃ©signe un bouton, pas un texte ; le gel du
      libellÃ© livrÃ© plus tÃ´t laisse la correction de coquille gratuite, mais
      une permutation d'options laisse les rÃ©ponses en place en changeant ce
      qu'elles signifient. RefusÃ©e quand l'ensemble des libellÃ©s (triÃ©s) est
      identique mais leur ordre/affectation change, tant que des rÃ©ponses
      existent
- [x] **Garde sÃ©parÃ©e du registre des quatre suppressions** â€” inscrite puis
      retirÃ©e du registre de convergence des confirmations destructives (il
      ne dÃ©truit rien, son marqueur doit diffÃ©rer) ; voir ADR-054
- [x] **Six sabotages jouÃ©s avec tÃ©moin**, dont un qui rejoue le geste
      trop large du premier essai et fait tomber les quatre tests protÃ©geant
      la correction de coquille

**AssumÃ©** : navigateurs Playwright non installÃ©s sur Windows pour forcer la
reproduction du flaky de la caisse â€” impact produit dÃ©jÃ  rÃ©futÃ©, le test
s'instrumente lui-mÃªme pour le prochain passage.

**Preuve** : 124 fichiers / 2 007 tests, typecheck 0, lint 0, CI verte sur
les sept contrÃ´les.

## V1.22 â€” Superviser les workers dont le heartbeat a fait ses preuves (âœ… 2026-07-31, PR #76)
**Objectif** : dernier point ouvert de la V1.20 â€” six crons quotidiens
dÃ©posaient des heartbeats depuis des semaines sans Ãªtre supervisÃ©s.

- [x] **Six crons hors de l'objectif de service** â€” `20260805240000` avait
      inscrit `automations`, `calendar-reminders`, `jackpot-draws`,
      `purge-data`, `reengage` et `webhooks` Ã  `enabled = false` avec un
      motif juste Ã  l'Ã©poque (Â« aucune route n'Ã©crit encore de
      heartbeat Â»). MesurÃ©, pas supposÃ© : les six appellent tous
      `startWorkerRunSafely` / `finishWorkerRunSafely` depuis. Une purge
      RGPD qui Ã©chouerait chaque nuit ne rÃ©veillerait personne
- [x] **Une rÃ¨gle, pas une liste** â€” migration `20260820120000`, un
      `UPDATE` conditionnel qui supervise tout worker ayant dÃ©jÃ  dÃ©posÃ© un
      succÃ¨s, gÃ©nÃ©ral et non Ã©numÃ©ratif (`expire-trials` reste `false`
      jusqu'Ã  son premier succÃ¨s), sans effet sur une base neuve (CI,
      poste de dÃ©veloppement). Voir ADR-053
- [x] **ContrÃ´le nÃ©gatif jouÃ© en deux tours** â€” le premier ne prouvait
      rien (`2>/dev/null` sur l'insertion du heartbeat de test, la
      commande dont l'Ã©chec Ã©tait l'information cherchÃ©e) ; refait sans
      redirection, concluant sur six sondes numÃ©rotÃ©es
- [x] **Une assertion retirÃ©e parce qu'elle avait tort** â€” Â« aucun succÃ¨s
      n'est enregistrÃ© Â» mesurait en rÃ©alitÃ© l'Ã©tat aprÃ¨s les propres
      insertions du fichier de test ; retirÃ©e plutÃ´t que rafistolÃ©e

**Preuve** : pgTAP 31 fichiers / 2 079 assertions PASS sur base vide et
semÃ©e ; Vitest 123 fichiers / 1 997 tests ; typecheck 0 ; lint 0 ; 93
migrations, `EXPECTED_MIGRATION` Ã  jour dans `src/lib/release.ts`.

## V1.21 â€” Le flaky de la caisse tranchÃ©, et trois documents qui mentaient (âœ… 2026-07-31, PR #75)
**Objectif** : dernier point ouvert du socle (le flaky `player-win.spec.ts`),
plus trois documents dont le contenu ne dÃ©crivait plus le code.

- [x] **Le flaky de la caisse innocentÃ© par lecture, pas par supposition**
      â€” `player-win.spec.ts` tombait par intermittence sur Â« panier absent
      aprÃ¨s un retrait rÃ©ussi Â». Les trois Ã©tages applicatifs sont sains :
      le champ est non contrÃ´lÃ© (sa valeur vit dans le DOM), le hook
      construit son `FormData` au moment du submit, et les deux chemins de
      remise persistent le panier jusqu'Ã  `participations.basket_cents`.
      Comme `parseBasketToCents("")` rend `null`, la seule lecture
      possible est un champ vide au clic
- [x] **Deux gestes sur le test** â€” attendre l'hydratation avant de
      saisir ; une assertion qui Ã©choue dÃ©sormais au moment du clic,
      distinguant course client et dÃ©faut serveur
- [x] **Non reproduit, dit tel quel** â€” la sonde a Ã©tÃ© Ã©crite et lancÃ©e,
      WSL a gelÃ© deux fois sous la charge du build avant de rendre un
      chiffre ; la cause reste dÃ©duite, pas mesurÃ©e
- [x] **Trois documents faux corrigÃ©s** â€” la roadmap annonÃ§ait le
      crÃ©ateur de quiz Â« non poussÃ© / non dÃ©ployÃ© Â» (rÃ©serve jamais levÃ©e
      alors qu'elle se tranchait en une commande) pendant que CLAUDE.md le
      dÃ©crivait dÃ©jÃ  comme livrÃ© ; idem pour la place de marchÃ© de
      campagnes (V1.15) ; `docs/bugs.md` annonÃ§ait Â« trois formulaires
      restent exposÃ©s Â» dont la caisse, corrigÃ©s depuis le second tour
      (PR #52â†’#59)

**Preuve** : pgTAP 31 fichiers / 2 079 assertions PASS sur base vide et
semÃ©e ; Vitest 123 fichiers / 1 997 tests ; typecheck 0 ; lint 0.

## V1.20 â€” L'autoritÃ© de Stripe s'arrÃªte avec l'abonnement, et un essai non confirmÃ© finit rÃ©siliÃ© (âœ… 2026-07-31, PR #73)
**Objectif** : deux points laissÃ©s ouverts par la V1.19, plus une demande du
client (Â« qu'un essai soit rÃ©siliÃ© si Stripe ne remonte pas de paiement
actif Â»).

- [x] **`protect_stripe_managed_entitlements` ignorait `active`** â€” un
      commerÃ§ant rÃ©siliÃ© restait Â« gÃ©rÃ© par Stripe Â» Ã  vie pour un accÃ¨s
      offert, alors qu'il en est la cible naturelle. CorrigÃ© par
      `and e.active` (migration `20260818120000`). Les deux `throws_ok` de
      `subscription_entitlements.test.sql` qui protÃ©geaient ce prÃ©dicat ont
      Ã©tÃ© remontÃ©s sur l'abonnement vivant (avant rÃ©siliation), avec un
      miroir aprÃ¨s rÃ©siliation qui relit la valeur et la frontiÃ¨re
      `past_due` contrÃ´lÃ©e sÃ©parÃ©ment. `org_effective_entitlements` porte le
      mÃªme dÃ©faut et n'est dÃ©libÃ©rÃ©ment pas corrigÃ©e (aucun appelant
      applicatif). Voir ADR-051
- [x] **Cron `expire-trials`** â€” un essai expirÃ© sans souscription restait
      `trialing` indÃ©finiment (mensonge de statut, pas de trou d'accÃ¨s).
      Trois garde-fous : Stripe interrogÃ© avant chaque bascule, une panne
      Stripe ne rÃ©silie personne, un abonnement vivant chez Stripe avec un
      statut local `trialing` est un webhook perdu et se remonte au lieu de
      se rÃ©silier. 18 lecteurs de `trialing` auditÃ©s, 7 modifiÃ©s. Voir
      ADR-052
- [x] **Deux rÃ©sidus repris Ã  la main** â€” `ops_worker_runs.worker` (clÃ©
      Ã©trangÃ¨re) exigeait une ligne de registre pour `expire-trials`, sans
      quoi son heartbeat Ã©chouait en silence ; `resolveStripeEntitlements`
      rendait un couple non auto-cohÃ©rent (`[]` â†’ plan `core` sans droits),
      corrigÃ© en semant les droits du plan retenu
- [x] **Erreur introduite puis corrigÃ©e dans le chantier** â€” la migration du
      registre ajoute un 9áµ‰ worker, `ops_monitoring.test.sql` Ã©pinglait
      Â« les huit workers Â» en dur : CI rouge, corrigÃ© en nommant la
      diffÃ©rence (`results_eq`) plutÃ´t qu'en comptant

**Reste ouvert, dÃ©cision explicite, non prise dans ce chantier** :
- [ ] les sept crons quotidiens sont inscrits mais non supervisÃ©s
      (`enabled = false`), `expire-trials` compris â€” lever la supervision
      est un `UPDATE`, pas une migration, une fois le premier passage
      constatÃ© en production

**Preuve** : pgTAP 31 fichiers / 2 079 assertions PASS sur base vide et
semÃ©e ; Vitest 123 fichiers / 1 997 tests ; typecheck 0 ; lint 0 ; 92
migrations, `EXPECTED_MIGRATION` Ã  jour dans `src/lib/release.ts`.

## V1.19 â€” Le second passage sur les trouvailles laissÃ©es de cÃ´tÃ© par un plafond de workflow (âœ… 2026-07-31, PR #72)
**Objectif** : la chasse aux bugs par parcours vÃ©cu du 2026-07-31 avait rendu
33 trouvailles, mais le traitement n'en avait retenu que 14
(`serieux.slice(0, 14)`, prÃ©cÃ©dÃ© d'un `filter(gravite !== 'mineur')`) et Â« 14
confirmÃ©es Â» a Ã©tÃ© rapportÃ© comme un bilan complet. Ce chantier reprend les
15 trouvailles sÃ©rieuses laissÃ©es de cÃ´tÃ©, en rÃ©futation adversariale avant
tout correctif.

- [x] **RÃ©futation adversariale des 15 trouvailles** â€” 11 tiennent, 4 sont
      fausses (plafond de dÃ©pense qui se dÃ©clenche bien, essai expirÃ© qui est
      le paywall dÃ©libÃ©rÃ©, compte Ã  rebours qui est ADR-017, dates UTC dÃ©jÃ 
      corrigÃ©es par la PR #71). DÃ©tail : docs/bugs.md
- [x] **Ã‰LEVÃ‰ â€” `settle_hunt_completions` sans aucune des quatre gardes de
      contexte** de `record_hunt_scan` (addon, statut, fenÃªtre) : un simple
      Ã©diteur pouvait vider une chasse Ã  une seule Ã©tape et faire Ã©mettre des
      centaines de codes `CHASSE-` rÃ©els sans plafond. Gardes ajoutÃ©es ;
      effet de bord fermÃ© (le solde d'une Ã©tape retirÃ©e en brouillon ne
      partait plus, rattrapÃ© Ã  la rÃ©activation) ; `hunt_settlement_preview`
      ajoutÃ©e pour que le refus de suppression d'Ã©tape nomme le nombre de
      codes qui seraient Ã©mis, pas seulement le nombre de joueurs en cours ;
      mÃªme dÃ©faut de forme trouvÃ© et corrigÃ© sur le calendrier
      (`calendar_players.opened_count`)
- [x] **Â« Avoir un client Stripe Â» n'est pas Â« avoir un abonnement Â»** â€” le
      bouton d'abonnement pouvait disparaÃ®tre dÃ©finitivement aprÃ¨s un retour
      sur la page Stripe, `past_due` ne coupait jamais l'accÃ¨s (action admin
      qui omettait `past_due_since`), le bandeau inventait une cause d'Ã©chec,
      un accÃ¨s offert avec module Ã©chouait sans dire pourquoi. Voir ADR-050
- [x] **Le dashboard affirmait Â« Active Â» sur une campagne injouable** â€”
      `status` stockÃ© vs jouabilitÃ© dÃ©rivÃ©e (fenÃªtre `starts_at`/`ends_at`),
      divergence structurelle sur les dix modÃ¨les de galerie
      (`auto_schedule: false`). PrÃ©dicat extrait et partagÃ©. Checklist
      d'accueil corrigÃ©e pour les non-propriÃ©taires dans le mÃªme geste
- [x] **Quatre gestes d'entretien qui coinÃ§aient un humain** â€” calendrier
      (rÃ©duction de grille dÃ©truisant des ouvertures), Ã©vÃ©nement live
      (Ã©dition de question effaÃ§ant les rÃ©ponses), chasse au trÃ©sor (Ã©cran
      fermant la porte qu'un correctif SQL laissait ouverte), Ã©quipe (rÃ´le
      d'un collÃ¨gue inchangeable â€” nouvelle RPC `set_team_member_role`)
- [x] **Le coÃ»t d'un lot ne se saisissait qu'au second temps** â€” lecture du
      `FormData` de crÃ©ation oubliait `cost_cents`/`value_cents`, prÃ©sents
      dans le schÃ©ma et lus par la modification
- [x] **Le 404 du panel envoyait chercher une cause inexistante** â€” le
      message, pas la coupure elle-mÃªme (dÃ©libÃ©rÃ©e, ADR existant,
      verrouillÃ©e par test) : sept pages de module renvoyaient un Â« vÃ©rifiez
      le sÃ©lecteur d'organisation Â» sans rapport avec l'expiration d'essai
- [x] **Supprimer une session d'Ã©vÃ©nement live emportait les lots non
      retirÃ©s** â€” `event_wins` en cascade, confirmation ajoutÃ©e nommant le
      nombre de lots en jeu
- [x] **`revoke all â€¦ from public, anon` ne retire pas `service_role`** â€”
      Ã©cart documentation/base mesurÃ© en base (217/231 fonctions),
      **pas une escalade** (`service_role` contourne dÃ©jÃ  la RLS). Voir
      ADR-049 pour le raisonnement et la vÃ©rification

**Reste ouvert, dÃ©cisions explicites, non prises dans ce chantier** :
- [x] `protect_stripe_managed_entitlements` ne filtrait pas son `exists` sur
      `active` â€” traitÃ© en V1.20 (PR #73)
- [ ] `calendar_players.opened_count` reste dÃ©salignÃ© dans le cas gÃ©nÃ©ral
      aprÃ¨s une rÃ©duction de grille (le recompte corrige l'affichage, pas la
      consÃ©quence sur des rÃ©compenses dÃ©jÃ  distribuÃ©es)
- [ ] aucun rattrapage rÃ©troactif global des chasses au trÃ©sor
- [ ] les invitations d'Ã©quipe dÃ©jÃ  en vol au moment d'un changement de rÃ´le
      restent silencieuses
- [ ] les 77 sites restants portant l'idiome `revoke â€¦ from public, anon`
      sans rÃ©voquer `service_role` explicitement ne sont pas touchÃ©s

**Preuve** : pgTAP 31 fichiers / 2 069 assertions PASS sur base vide et
semÃ©e (2 031 avant) ; Vitest 122 fichiers / 1 966 tests ; typecheck 0 ; lint
0 ; build vert ; 90 migrations, `EXPECTED_MIGRATION` Ã  jour dans
`src/lib/release.ts`. Trois sabotages de harnais rencontrÃ©s et corrigÃ©s en
route (deux mouraient au dÃ©marrage en comptant onze faux rouges chacun ; un
troisiÃ¨me restait vert sur un sabotage rÃ©ellement appliquÃ© et a rÃ©vÃ©lÃ© que le
cas dangereux rÃ©el Ã©tait l'inverse de celui supposÃ©).

## V1.18 â€” MÃ©ta-progression branchÃ©e (âœ… 2026-07-27, **en production**, E2E rÃ©Ã©crit et vert)
**Objectif** : brancher un module de gamification transversale (missions,
collections, badges, clÃ©s, coffres, saisons) dont **1 713 lignes de SQL
dormaient** â€” 14 tables `progression_*` et 13 fonctions, aucune RPC appelÃ©e,
aucune UI. C'Ã©tait la seule fondation entiÃ¨rement morte du projet et le nÂ°1
du backlog de l'audit 3 (item 13). Voir ADR-044 et ADR-045.

> **Ã‰tat de livraison au 2026-07-27** : branche `chantier/audit-3` poussÃ©e,
> **PR #29 entiÃ¨rement verte (6/6 jobs)** aprÃ¨s 13 passages CI. Dernier
> commit `c131340`. Migrations `20260805200000` / `20260805210000` /
> `20260805220000` non fusionnÃ©es sur `main`, donc non appliquÃ©es en
> production Ã  ce stade.
>
> **13 passages CI ont trouvÃ© 8 dÃ©fauts qu'aucune relecture n'avait vus**
> (fonctions SQL inappelables, ambiguÃ¯tÃ© de colonne, veto du registre
> universel sur les tables legacy, double ligne Stripe, pagination Stripe,
> contraste a11y du bouton `danger`, harnais E2E Stripe dÃ©salignÃ©, suite
> pgTAP sans contexte d'appel â€” dÃ©tail dans docs/bugs.md), **et une erreur de
> diagnostic personnelle** : `router.refresh()` (`15364ee`) prÃ©tendait
> rÃ©soudre un Ã©cran vide alors qu'il crÃ©ait lui-mÃªme le blocage â€” annulÃ© par
> `c131340` aprÃ¨s relecture d'une trace Playwright.
>
> **Fait produit dÃ©couvert au passage, puis corrigÃ© le mÃªme jour** : l'item 5
> du backlog (identitÃ© joueur unifiÃ©e) a un temps Ã©tÃ© requalifiÃ© en
> **prÃ©requis** de ce module â€” `experience_started`/`experience_completed`,
> Ã©mis par le spin, ne portaient que `player_key`, jamais `player_id` ; le
> moteur renonÃ§ait Ã  sa premiÃ¨re garde, aucune mission ne progressait depuis
> la roue (ADR-045). **La cause posÃ©e alors Ã©tait fausse** : la rÃ©solution
> `player_id` existait dÃ©jÃ  (`append_experience_event_internal`), le vrai
> dÃ©faut Ã©tait un ordre d'Ã©criture. CorrigÃ© par `a963583` (trigger
> `AFTER INSERT` sur `player_legacy_identities`) â€” voir ADR-045 (addendum) et
> plus bas.

- [x] **Le moteur est un trigger, pas un appel** â€” `apply_meta_progression_event()`
      branchÃ© sur `experience_events` : les missions progressent depuis les
      9 expÃ©riences existantes **sans une seule ligne applicative**. Brancher
      ce module a livrÃ© la lecture, l'Ã©criture de configuration et
      l'ouverture de coffre â€” jamais la progression elle-mÃªme, qui tournait
      dÃ©jÃ 
- [x] **DB â€” 3 migrations** : `20260805200000_meta_progression.sql`
      (1 713 l., prÃ©existante, 14 tables / 13 fonctions) ;
      `20260805210000_meta_progression_lifecycle.sql` (1 566 l., `bf2c3d3`) â€”
      18 fonctions : clÃ´ture / archivage / suppression de saison, Ã©dition et
      suppression **bornÃ©es au brouillon**, sel serveur
      `progression_chests.loot_seed` (le tirage Ã©tait
      `md5(request_id â€– item.id)` avec un `request_id` **fourni par le
      client**, meulable hors ligne), table `progression_engine_failures`,
      purge corrigÃ©e ; `20260805220000_meta_progression_hardening.sql`
      (1 380 l., `3174cbd`) â€” suites de la revue de sÃ©curitÃ©
- [x] **Backend** â€” `src/lib/meta-progression.ts`,
      `src/lib/validations/meta-progression.ts`,
      `src/actions/meta-progression.ts` (**27 RPC exposÃ©es**), seaux de
      rate-limit `progressionDevice` / `progressionPlayerAction` /
      `progressionPublicIp`, 9e RPC de purge dans le cron `purge-data`, sonde
      SLO du journal moteur dans `src/lib/admin/ops.ts`
- [x] **Frontend** â€” Ã©diteur `/dashboard/progression`, panneau joueur greffÃ©
      au parcours public **existant** `/play/[slug]` (**aucune nouvelle
      surface publique** : la progression est scopÃ©e par organisation, sans
      objet propre Ã  adresser par une URL)
- [x] **Invariant NON MONÃ‰TAIRE** â€” clÃ©s, badges, objets et coffres sont des
      marqueurs d'engagement : aucun code de caisse, aucune ligne
      `reward_issuances`, aucune colonne `*_cents`. VÃ©rifiÃ© par **grep
      inverse** : aucun autre module ne lit ces tables
- [x] **Interrupteur d'arrÃªt** â€” `set_progression_mission_enabled` /
      `set_progression_chest_enabled`, seul geste autorisÃ© sur une saison
      lancÃ©e, ne touchent que `enabled`, jamais les rÃ¨gles ni les dotations
- [x] **Tests** â€” **1 304 tests unitaires**, pgTAP `meta_progression.test.sql`
      (**293 assertions**) + `security_acl.test.sql` (**506**),
      `e2e/progression.spec.ts` â€” **exÃ©cutÃ©s via la PR #29** : 22/22 suites
      pgTAP, 1 781 assertions, E2E verts (voir plus bas)
- [x] **Revue sÃ©curitÃ© : GO conditionnel**, 0 CRITIQUE, 0 Ã‰LEVÃ‰. 3 MOYEN
      corrigÃ©s : **M1** seau `failClosed` composÃ© sur l'`organizationId`
      **fourni par le client** (dÃ©bit non bornÃ© avec un cookie, rafale
      invisible au monitoring car le compteur d'observabilitÃ© Ã©tait appelÃ©
      aprÃ¨s le contrÃ´le d'organisation) â†’ seau sur la seule clÃ© d'identitÃ©,
      consommÃ© en amont, observation hissÃ©e avant le contrÃ´le ; **M2**
      commentaire d'invariant **faux** sur `org_progression_snapshot`
      (affirmait qu'un caissier lisait strictement moins qu'un visiteur â€”
      infirmÃ© sur 4 points) â†’ branche `seasons` passÃ©e Ã  `is_org_editor`,
      commentaire rÃ©Ã©crit ; **M3** aucun interrupteur d'arrÃªt â†’ livrÃ© (voir
      ci-dessus). 5 FAIBLE corrigÃ©s dont **F1** (relecture d'idempotence
      ignorant `chest_id`) et **F2** (`progression_engine_failures` sans
      lecteur)
- [x] `ef721aa` â€” CLI Supabase en devDependency (inspection distante possible,
      pas les modes `--local`)
- [x] `792f2a3` â€” CI **rÃ©paratrice** : la garde anti-dÃ©rive des types publie
      le snapshot rÃ©gÃ©nÃ©rÃ© en artefact `database-generated-types` au lieu de
      le jeter (seul chemin praticable pour rafraÃ®chir
      `src/types/database.generated.ts`, pÃ©rimÃ© depuis 9 migrations)

> âœ… **Preuve obtenue au 2026-07-27** : la branche a Ã©tÃ© poussÃ©e, la PR #29
> ouverte, et **13 passages CI** l'ont fait passer du rouge au vert. Ã‰tat
> final : **22/22 suites pgTAP, 1 781 assertions, E2E verts, 1 304 tests
> unitaires, snapshot de types Ã  jour** (rÃ©cupÃ©rÃ© depuis l'artefact
> `database-generated-types` de `792f2a3`, `48fa440`). `e2e/progression.spec.ts`
> contenait deux dÃ©fauts dans une mÃªme assertion (un `getByRole("heading")`
> sur un `<p role="group">`, et un libellÃ© attendu sans le mot Â« maintenant Â»),
> tous deux trouvÃ©s par **relecture du markup**, aucun par exÃ©cution
> (`793100a`). L'exÃ©cution elle-mÃªme a trouvÃ© **8 autres dÃ©fauts**, dans
> d'autres migrations et modules du mÃªme chantier â€” voir docs/bugs.md pour le
> dÃ©tail commit par commit (`4c6a010`, `c0d5549`, `573c724`, `4e899c7`,
> `03be9ea`, `3409544`, `4ecf165`, `6973d13`).
>
> âš ï¸ **Deux erreurs personnelles commises pendant ce durcissement, Ã 
> consigner honnÃªtement** : (1) `15364ee` diagnostiquait un Ã©cran vide comme
> un dÃ©faut de rafraÃ®chissement et ajoutait `router.refresh()` â€” appelÃ© dans
> `startTransition`, il maintenait `pending` vrai jusqu'au rendu serveur
> complet et rÃ©initialisait les champs non contrÃ´lÃ©s du formulaire suivant,
> **crÃ©ant** le blocage qu'il prÃ©tendait rÃ©soudre ; annulÃ© par `c131340` aprÃ¨s
> relecture d'une trace Playwright montrant le bouton figÃ© sur
> Â« Enregistrementâ€¦ Â». (2) `602d4eb` sur-gÃ©nÃ©ralisait Ã  quatre sÃ©lecteurs
> l'Ã©galitÃ© stricte prouvÃ©e sur un seul nom par le markup ; corrigÃ© par
> `20ff8e8`.
>
> âœ… **PrÃ©requis d'identitÃ© (ADR-045) traitÃ© le 2026-07-27 par `a963583`** :
> `experience_started`/`experience_completed` (Ã©mis par le spin) ne portaient
> que `player_key`, jamais `player_id` â€” Ã©tabli en local contre un vrai
> Postgres (`c131340`), la cause avancÃ©e alors (Â« les deux systÃ¨mes ne se
> rencontrent jamais Â») Ã©tait fausse. La rÃ©solution existait dÃ©jÃ 
> (`append_experience_event_internal`) ; le vrai dÃ©faut Ã©tait un ordre
> d'Ã©criture, corrigÃ© par un trigger `AFTER INSERT` sur
> `player_legacy_identities` (`20260805230000`). `supabase test db` â†’
> 1 804 assertions PASS (1 781 avant), contrÃ´le nÃ©gatif concluant. **La
> mÃ©ta-progression progresse dÃ©sormais dÃ¨s le premier tour de roue.** Voir
> item 5 de `docs/audit-3-backlog.md`, traitÃ©, et ADR-045 (addendum).
>
> âš ï¸ **Ce constat Â« E2E verts Â» est dÃ©passÃ©, Ã  ne pas rÃ©pÃ©ter.** Une fois
> `e2e/progression.spec.ts` rÃ©activÃ© (`a8c31c7`, voir Â« Suites ouvertes Â»
> ci-dessous), le bloc `describe.serial` s'est rÃ©vÃ©lÃ© instable et le client a
> choisi de le garder actif et rouge (`ba0cdbf`) : **la PR #29 est rouge sur
> ce seul point**, 5 jobs verts sur 6.

**Suites ouvertes** :
- [ ] **Fusionner la PR #29 sur `main`** et vÃ©rifier l'application des
      migrations en production
- [x] **RÃ©activer `e2e/progression.spec.ts`** â€” fait (`a8c31c7`), le
      `test.fixme` n'avait plus de raison d'Ãªtre depuis `a963583`. **RÃ©sultat :
      instable**, pas vert â€” le bloc `describe.serial` Â« cycle de vie complet Â»
      Ã©choue de faÃ§on mobile (titre de saison, collection, objet, mission,
      rÃ©activation, coffre) sur six passages CI consÃ©cutifs, avec un code
      identique Ã  chaque fois. Ce n'est pas un dÃ©faut applicatif (1 804
      assertions pgTAP dont un contrÃ´le nÃ©gatif, parcours passÃ© intÃ©gralement
      plusieurs fois) mais la longueur de la chaÃ®ne : treize Ã©tapes serveur en
      sÃ©rie sur un seul projet. **DÃ©cision client (`ba0cdbf`) : garder ce test
      actif et rouge plutÃ´t que de le neutraliser** â€” la PR #29 reste rouge sur
      ce seul point. DÃ©tail : docs/bugs.md
- [ ] **Fiabiliser `e2e/progression.spec.ts` par un seed en base** â€” la
      correction juste identifiÃ©e (pas une retouche) : semer la configuration
      de saison directement en base et ne faire porter Ã  l'E2E que les
      comportements d'Ã©cran, au lieu d'enchaÃ®ner treize crÃ©ations pilotÃ©es Ã 
      l'Ã©cran sur un seul projet. Chantier dÃ©diÃ©, non commencÃ©
- [ ] **Ã‰tendre la visibilitÃ© du panneau joueur** au-delÃ  de la roue : les
      14 jeux rapides, le passeport, le calendrier, le quiz, la chasse, le
      jackpot et l'Ã©vÃ©nement live font dÃ©jÃ  progresser les missions en base,
      mais le joueur ne les voit que depuis la roue.
      **VersÃ© le 2026-08-02** (chasse par parcours vÃ©cu, trouvaille rÃ©futÃ©e en
      tant que dÃ©faut â€” la limitation est dÃ©cidÃ©e, ADR-044) : l'Ã©diteur de
      saison laisse cocher les neuf familles sans avertir qu'aucune surface
      hors roue ne rendra le panneau ; un commerÃ§ant sans campagne de roue
      configure donc une saison que personne ne pourra consulter ni encaisser.
      L'avertissement dans l'Ã©diteur est le geste le moins cher de cet item
- [ ] RÃ©sidus assumÃ©s (docs/bugs.md) : seau par appareil bornÃ© Ã  un cookie,
      pas un humain ; `observeProgressionPressure` toujours keyÃ©e sur
      l'`organizationId` client (plafonnÃ© en amont) ; sonde F2 sans test
      dÃ©diÃ© ; pas de garde d'addon (monÃ©tisation reportÃ©e) ;
      couverture E2E de l'interrupteur **coffre** Ã©cartÃ©e (miroir de la
      mission) ; branche `mission already has player progress` inatteignable
      aujourd'hui ; rÃ©ordonnancement des objets de collection non exposÃ© en UI
- [ ] 4 sous-items hors pÃ©rimÃ¨tre, en attente d'arbitrage produit : parcours
      personnalisÃ©s, validation d'achat POS/ticket, dÃ©fis entre Ã©quipes,
      campagnes rÃ©seau â€” aucune des 14 tables ne les porte

## V1.17 â€” Encaissement en caisse des rÃ©compenses de pronostics (âœ… 2026-07-25, poussÃ©e)
**Objectif** : combler une **anomalie fonctionnelle en production**. Les
pronostics Ã©mettaient dÃ©jÃ  un code `PRONO-â€¦` (`contest_awards.code`, posÃ© par
`finalize_contest`), le joueur le voyait et l'interface lui disait de le
prÃ©senter en caisse â€” mais `lookupRedeemCode` ne routait que **8 sources** et le
seul chemin de remise, `set_contest_award_status`, exige `is_org_editor` : **un
caissier ne pouvait pas remettre le lot**. Voir ADR-043.

> **Ã‰tat de livraison au 2026-07-25 (fin de journÃ©e)** : les 6 commits
> `e310606` â†’ `f873b77` ont Ã©tÃ© **POUSSÃ‰S** â€” `origin/main` = `f873b77`.
> L'application de la migration `20260804120000` **en production reste non
> vÃ©rifiÃ©e**. L'Ã©cart local/distant porte dÃ©sormais sur le chantier suivant
> (audit 3, branche `chantier/audit-3`), pas sur celui-ci.

- [x] **DB** (`e310606`) â€” migration `20260804120000_contest_award_redemption.sql` :
      `contest_awards.delivered_at` **renommÃ©e `redeemed_at`** (une seule colonne
      de vÃ©ritÃ©, alignÃ©e sur les 7 modules frÃ¨res) + `redeemed_by`,
      `basket_cents`, `redeem_expires_at` ; CHECK
      `(status = 'delivered') = (redeemed_at is not null)` ; index unique
      `(organization_id, code)` ; `contests.code_ttl_seconds` (nullable, bornÃ©
      **3 600 s Ã  7 776 000 s**, borne volontairement diffÃ©rente de celle des
      campagnes â€” le dÃ©compte part de la CLÃ”TURE du championnat, pas du passage
      en caisse) + trigger figeant l'Ã©chÃ©ance Ã  l'Ã©mission ; RPC
      `redeem_contest_award` atomique / idempotente / auditÃ©e / org-scopÃ©e,
      `service_role` seule. `EXPECTED_MIGRATION` bumpÃ© dans le mÃªme commit
- [x] **Backend** (`700a253`) â€” `normalizeContestCode` (`src/lib/utils.ts`),
      `lookupContestAwardByCode`, `redeemContestAward` et routage **9e source**
      dans `src/actions/participations.ts` (`CashierMatch { source: 'contest' }`),
      `code_ttl_seconds` ajoutÃ© aux validations Zod
      (`src/lib/validations/pronostics.ts`, bornes miroir du CHECK SQL)
- [x] **Frontend** (`0a95ae8`) â€” `ContestResult` + `ContestRedeemButton` dans la
      caisse `/dashboard/redeem`, palmarÃ¨s du championnat enrichi (quand / par
      qui / quel panier), rÃ©glage d'expiration **en jours** dans les paramÃ¨tres du
      championnat, Ã©chÃ©ance du code affichÃ©e au joueur sur `/pronos/[slug]`
- [x] **E2E** (`931c21b`) â€” `e2e/pronostics.spec.ts` : boucle complÃ¨te clÃ´ture â†’
      le joueur lit son code â†’ saisie en caisse â†’ remise validÃ©e avec panier â†’
      **seconde tentative refusÃ©e**, assertÃ©e sur les DEUX faces (caisse et joueur)
- [x] **Correctifs de finition** â€” `76c72dc` : le formulaire n'Ã©crase plus un TTL
      non reprÃ©sentable en jours entiers ; `f873b77` (**M1** de la revue +
      durcissement) : jointures org-scopÃ©es dans la RPC et contrÃ´le de doublons
      explicite avant la crÃ©ation de l'index unique
- [x] **Revue sÃ©curitÃ© : GO conditionnel**, aucun CRITIQUE ni Ã‰LEVÃ‰. **M1** â€”
      fuite potentielle du nom du championnat et du **prÃ©nom du gagnant** d'une
      autre organisation si `contest_awards.organization_id` se dÃ©synchronisait
      de `contests` â†’ corrigÃ©, et **Ã©tendu Ã  l'`UPDATE`** : ne scoper que la
      lecture aurait produit un Ã©tat PIRE (lot consommÃ© et auditÃ© pendant que la
      caisse affiche Â« code inconnu Â»)
- [x] QA : **1 147 tests âœ“**, typecheck âœ“, lint âœ“, build âœ“

> âš ï¸ **Trou rÃ©el du chantier** : les **43 assertions pgTAP** de
> `supabase/tests/contest_awards.test.sql` et les **4** de l'audit ACL central
> **n'ont JAMAIS Ã©tÃ© exÃ©cutÃ©es** (ni Docker ni CLI Supabase disponibles en
> local) â€” elles ne seront prouvÃ©es qu'au job `database-security` de la CI.

**Suites ouvertes** :
- [ ] **Pousser et dÃ©ployer** : `origin/main` est restÃ© Ã  `eb3193d` (2026-07-25
      10:47) alors que le chantier s'achÃ¨ve Ã  `f873b77` (2026-07-25 16:49) ;
      migration `20260804120000` Ã  appliquer avant le code
- [ ] **M2 â€” jeton `cashier:lookup` consommÃ© par famille de codes** : une saisie
      NUE de 8 caractÃ¨res consomme **9** jetons et ramÃ¨ne le caissier Ã 
      ~3 recherches/minute, le refus s'affichant Â« code introuvable Â» sur un lot
      valide. Correctif **Ã©crit et vert (1 222 tests) mais NON COMMITÃ‰** :
      `src/actions/participations.ts` porte 495 lignes mÃªlant ce correctif et le
      chantier Â« registre universel Â» en cours. Ã€ reprendre quand l'arbre sera au
      propre â€” concerne les **9** sources, pas seulement les pronostics
- [ ] RÃ©sidus assumÃ©s (docs/bugs.md) : dÃ©rogation Ã©diteur Ã  l'expiration, absence
      de garde `hasPronosticsAccess` sur la remise (cohÃ©rente avec les 8 autres
      sources), bascule de tie-break sur les codes nus, lot **annulÃ©** encore
      prÃ©sentÃ© comme encaissable au joueur, refus de remise non auditÃ©s,
      `finalize_contest` sans boucle anti-collision, `set_contest_award_status`
      scopÃ© sans revÃ©rifier `contests`

## V1.16 â€” CrÃ©ateur de quiz (âœ… 2026-07-25, **en production**)
**Objectif** : demande client â€” un **crÃ©ateur de quiz** jouable depuis un QR ou
un lien, en libre-service. Usages visÃ©s : restaurant (questions sur la cuisine),
cave / bar (dÃ©gustation), salon professionnel (les exposants), boutique
(dÃ©couverte des produits), musÃ©e (parcours culturel), entreprise (team building),
club sportif. Le client a prÃ©cisÃ© que Â« le moteur des pronostics pourra Ãªtre
rÃ©utilisÃ© pour une grande partie du classement Â».

> âœ… **CLOS LE 2026-07-31 â€” le module est en production, constatÃ© et non
> prÃ©sumÃ©.** `npx supabase migration list --linked` rend `20260803120000` au
> **`remote`** comme au `local`. La migration est appliquÃ©e ; V1.15 (place de
> marchÃ©, `20260802120000`) l'est Ã©galement.
>
> **Cette entrÃ©e a menti pendant six jours, et c'est ce qui vaut d'Ãªtre
> retenu.** Elle a d'abord affirmÃ© Â« seul chantier NON POUSSÃ‰ / NON DÃ‰PLOYÃ‰ Â»
> â€” vrai le jour mÃªme. Une premiÃ¨re correction, le soir, a constatÃ© le push
> mais a laissÃ© ouvert Â« l'application de la migration en production reste non
> vÃ©rifiÃ©e Â». Cette rÃ©serve n'a plus jamais Ã©tÃ© levÃ©e, alors qu'elle se
> tranchait en une commande. Pendant ce temps `CLAUDE.md` dÃ©crivait le module
> comme livrÃ© : **deux documents du mÃªme dÃ©pÃ´t se contredisaient sur un fait
> vÃ©rifiable**, et personne ne pouvait dire lequel croire.
>
> Une rÃ©serve qu'on n'a pas les moyens de lever, on l'Ã©crit. Une rÃ©serve qui
> se lÃ¨ve en une commande, on la lÃ¨ve.

- [x] **3 arbitrages client** â€” ADR-040 : (1) **module DÃ‰DIÃ‰**, ni un
      `event_kind` des pronostics ni une extension de l'Ã©vÃ©nement live â€”
      l'intention Â« je crÃ©e un quiz Â» est distincte, et la **sÃ©mantique de la
      vÃ©ritÃ© diffÃ¨re** (dans un pronostic la rÃ©ponse est inconnue de tous jusqu'au
      rÃ©sultat ; dans un quiz elle existe DÃˆS la crÃ©ation, donc la non-fuite
      change de nature), tout comme le cycle de vie (`event_sessions` =
      SYNCHRONE, l'organisateur lance chaque question ; `quizzes` = ASYNCHRONE, le
      JOUEUR dÃ©marre chaque question) ; (2) les **7 types de questions** demandÃ©s ;
      (3) les **5 modes de rÃ©compense** demandÃ©s
- [x] **ModÃ©lisation â€” 4 formes de rÃ©ponse, pas 7 types** :
      `question_type in ('choice','number','ranking','text')` (LE MOTEUR) +
      **2 dimensions transversales** (`time_limit_seconds`, `image_url`) + un
      champ **`preset`** libre de forme qui porte les 7 modÃ¨les d'interface
      (`multiple_choice`, `true_false`, `mystery_image`, `estimate`, `timed`,
      `ranking`, `free_prediction`). Un type Â« chronomÃ©trÃ© Â» aurait interdit le
      Â« choix multiple chronomÃ©trÃ© Â», pourtant l'usage le plus courant ;
      Â« vrai/faux Â» n'est qu'un choix Ã  2 options ; Â« image mystÃ¨re Â» est un
      mÃ©dia. MÃªme couple `event_kind`/`question_type` que les pronostics, et
      `choice`/`number`/`ranking` **rÃ©utilisent leurs validateurs**
      (`is_valid_contest_options`/`is_valid_contest_answer`) â€” seule la rÃ©ponse
      libre est du code neuf. **Ajouter un 8e modÃ¨le = une entrÃ©e de catalogue,
      sans migration**
- [x] **DB** â€” migration `20260803120000_quizzes.sql` : `addon_quiz` + 5 tables
      (`quizzes`, `quiz_questions`, `quiz_players`, `quiz_answers`,
      `quiz_rewards`), 16 fonctions dont **10 RPC `service_role`**, `spins.source`
      Ã©tendu Ã  `'quiz'` ; pgTAP `quizzes.test.sql` + 5 lignes RLS et 10 assertions
      dans l'audit ACL central
- [x] **Backend** â€” `src/lib/quiz.ts` (mappers PURS), `src/lib/quiz-context.ts`,
      `src/lib/validations/quiz.ts`, `src/actions/quiz.ts` (parcours public
      rejoindre / prÃ©senter / rÃ©pondre / terminer / tour offert / polling /
      classement + CRUD commerÃ§ant) ; caisse **8e prÃ©fixe `QUIZ-`**, rate-limit
      ADR-032, purge RGPD branchÃ©e au cron `purge-data`
- [x] **6 invariants de sÃ©curitÃ©** : non-fuite de la bonne rÃ©ponse en **3 couches**
      (RPC â†’ mapper â†’ type jouable sans champ de vÃ©ritÃ©), **chronomÃ¨tre
      inforgeable** (aucune RPC n'accepte de paramÃ¨tre de temps, `elapsed_ms`
      calculÃ© en base, `started_at` posÃ© une seule fois et gelÃ© y compris pour le
      `service_role`), **une seule rÃ©ponse immuable** par (joueur, question),
      **tirage idempotent** (3 verrous indÃ©pendants), **stock fini obligatoire**
      dÃ¨s qu'un mode Ã©met (ADR-031), **multi-tenant / ADR-032**
- [x] **Frontend** â€” Ã©diteur (`src/app/dashboard/quiz/*`,
      `src/components/dashboard/quiz-*`) : les 7 modÃ¨les pilotÃ©s par
      `quizFormShape`, bonne rÃ©ponse saisie sous bandeau ðŸ”’, dotation des 5 modes
      et bouton de tirage ; parcours joueur (`src/app/quiz/[slug]`,
      `src/components/quiz/*`) : sas Â« je suis prÃªtÂ·e Â», questions une par une,
      correction immÃ©diate, Ã©cran de fin, classement, partage, code `QUIZ-â€¦` ou
      tour de roue offert ; a11y (`role="timer"` sans rÃ©gion live,
      `role="status"`, clavier, motion-reduce)
- [x] **Revue sÃ©curitÃ© : GO conditionnel â†’ tout corrigÃ©** (`fe1e57b`) â€”
      **E1 (Ã‰LEVÃ‰, bloquant)** : le mode `instant` Ã©mettait le lot **sans qu'aucune
      rÃ©ponse existe** (rejoindre + terminer = un code ; l'identitÃ© Ã©tant un
      cookie gratuit, une boucle vidait le stock depuis une seule IP) â†’ Ã©mission
      conditionnÃ©e Ã  la complÃ©tion rÃ©elle ; **E2 (Ã‰LEVÃ‰, Sybil)** : une passe
      jetable collecte le corrigÃ© COMPLET, puis chaque identitÃ© neuve franchit le
      seuil â†’ **Turnstile sur le SEUL appel Ã©metteur** (`finishQuiz`) et seulement
      si un lot est en jeu, rien sur join/start/submit (ADR-032) ;
      **M1 (RGPD)** : email persistÃ© sans consentement â†’ refus explicite ;
      **M2 (RGPD)** : purge laissant les rÃ©ponses LIBRES (PII) â†’ neutralisÃ©es ;
      **M3 (piÃ¨ge irrÃ©versible)** : un tirage Ã  vide posait `draw_state='done'` Ã 
      0 gagnant et **figeait la dotation** â†’ drapeau posÃ© seulement aprÃ¨s Ã©mission
      rÃ©elle, Ã©tat `no_participants`, tirage relanÃ§able
- [x] **DÃ©faut de PRODUCTION corrigÃ© au passage** (`b483740`) : la base portait
      **8 addons**, le back-office n'en exposait que **6** et
      `src/lib/admin/data.ts` ne LISAIT mÃªme pas les deux manquantes â€” le module
      **Parrainage, en production, ne pouvait Ãªtre activÃ© pour AUCUN commerÃ§ant**.
      Les 8 sont dÃ©sormais basculables et lues
- [x] QA : E2E `e2e/quiz.spec.ts` (parcours complet + double passage en caisse ;
      absence des vÃ©ritÃ©s prouvÃ©e sur `page.content()`, payload RSC compris) +
      seed dÃ©terministe + 6 gardes de chemin ; typecheck âœ“, lint âœ“, 1116 tests âœ“

**Suites ouvertes** :
- [ ] **Pousser et dÃ©ployer** (migration `20260803120000` + code ;
      EXPECTED_MIGRATION dÃ©jÃ  Ã  `20260803120000`)
- [ ] RÃ©sidus assumÃ©s (docs/bugs.md) : Sybil Ã©conomique bornÃ© par
      `reward_stock` seul, aucune borne minimale de temps humain en SQL,
      `out_of_stock` terminal, purge par anonymisation, tour offert insensible Ã 
      l'Ã©tat de la roue cible, prÃ©nom non modÃ©rÃ© au classement
- [ ] `setMerchantCompAccess` (accÃ¨s offert) ne couvre que 4 des 8 addons â€”
      incohÃ©rence prÃ©existante Ã  reprendre

## V1.15 â€” Place de marchÃ© de campagnes (âœ… 2026-07-25, **en production**)
**Objectif** : demande client â€” le commerÃ§ant part d'un MODÃˆLE au lieu de
configurer une campagne de zÃ©ro. Dix modÃ¨les (Saint-Valentin, Halloween, NoÃ«l,
ouverture de boutique, anniversaire, match de football, fÃªte des MÃ¨res, happy
hour, soldes, lancement de produit), chacun portant **7 promesses** : le visuel,
le jeu, les textes, les rÃ©compenses suggÃ©rÃ©es, les emails, la durÃ©e, les rÃ¨gles.

> âœ… Construit, QA verte, revue sÃ©curitÃ© GO aprÃ¨s correctif, **et en
> production** : `20260802120000` figure au `remote` comme au `local`
> (constatÃ© le 2026-07-31, `supabase migration list --linked`).
>
> La rÃ©serve prÃ©cÃ©dente â€” Â« l'application effective de la migration n'a pas Ã©tÃ©
> revÃ©rifiÃ©e Â» â€” a survÃ©cu six jours Ã  cÃ´tÃ© d'un `CLAUDE.md` qui dÃ©crivait le
> module comme livrÃ©. Elle se levait en une commande. MÃªme remarque qu'en
> V1.16 : une rÃ©serve qu'on peut lever, on la lÃ¨ve ; sinon deux documents du
> mÃªme dÃ©pÃ´t finissent par se contredire sur un fait vÃ©rifiable.

- [x] **3 arbitrages client** â€” ADR-039 : (1) **catalogue Lastchance EN CODE**
      (10 modÃ¨les versionnÃ©s) **+ modÃ¨les PRIVÃ‰S** enregistrÃ©s par le
      commerÃ§ant, visibles de sa seule organisation ; **pas** de place de marchÃ©
      partagÃ©e entre commerÃ§ants (Ã©cartÃ©e : modÃ©ration, isolation du contenu
      publiÃ©, propriÃ©tÃ© des visuels â€” projet Ã  part) ; (2) appliquer un modÃ¨le
      crÃ©e une campagne **EN BROUILLON complÃ¨te** (relue, ajustÃ©e et activÃ©e par
      le commerÃ§ant) ; (3) emails fournis en **TEXTES, jamais activÃ©s**
- [x] **DB** â€” migration `20260802120000_campaign_templates.sql` : table
      `campaign_templates` (modÃ¨les privÃ©s seulement â€” `name` unique par
      organisation, `description`, `blueprint jsonb` **objet bornÃ© Ã  32 Ko**,
      `source_campaign_id`, `created_by` posÃ© par trigger depuis la session).
      Isolation : policy unique `campaign_templates: editors`, **FK composite**
      `(source_campaign_id, organization_id) â†’ campaigns(id, organization_id)`,
      `organization_id` hors du grant UPDATE, aucune policy `anon`/`public` ;
      pgTAP `campaign_templates.test.sql` avec **sentinelle** qui Ã©choue si une
      policy venait Ã  citer `anon`/`public`
- [x] **Backend** â€” `src/lib/campaign-templates.ts` (module pur : type
      `CampaignBlueprint`, `blueprintToDraft`, les 10 modÃ¨les),
      `src/lib/validations/campaign-templates.ts` (Zod : la base ne garantit que
      Â« objet jsonb â‰¤ 32 Ko Â», la FORME est validÃ©e lÃ , dans les DEUX chemins),
      `src/actions/campaign-templates.ts` (`applyCampaignTemplate`,
      `saveCampaignAsTemplate`, `deleteCampaignTemplate`)
- [x] **3 invariants d'innocuitÃ©** (le cÅ“ur du design) : **BROUILLON INERTE**
      (`status: 'draft'` ET `auto_schedule: false` verrouillÃ© au niveau du TYPE â€”
      sans lui le cron `run_campaign_schedule()` aurait publiÃ© la campagne tout
      seul dÃ¨s `starts_at` ; aucun champ `status`/`auto_schedule`/`starts_at`/
      `ends_at` dans le schÃ©ma Zod) ; **AUCUN ENVOI** (`automation_settings`,
      `enqueueJob`, `@/lib/resend` absents du chemin ; un modÃ¨le enregistrÃ© part
      avec `emails: []`) ; **MULTI-TENANT** (organisation et rÃ´le de la session,
      modÃ¨le privÃ© lu avec le client de SESSION sous RLS + filtre organisation
      explicite, aucun `createAdminClient`)
- [x] **Frontend** â€” galerie serveur en deux sections (Â« ModÃ¨les Lastchance Â» /
      Â« Mes modÃ¨les Â»), aperÃ§u des 7 promesses en **lecture dÃ©fensive** (un
      blueprint d'une version antÃ©rieure s'affiche en dÃ©gradÃ© au lieu de casser
      la page), enregistrement d'une campagne comme modÃ¨le et suppression
- [x] **Revue sÃ©curitÃ© : GO, 0 bloquant â€” 1 MOYEN corrigÃ©** (`4457b20`) : le
      blueprint recopie `wheels.skill_config`, donc les **SECRETS des jeux de
      dÃ©fi** (mot mystÃ¨re, nombre cible, ordre du puzzle) ; la lecture ouverte Ã 
      `is_org_member` les faisait passer d'Â« Ã©diteurs seulement Â» Ã  Â« toute
      l'Ã©quipe, **CAISSIERS compris** Â» (avec en effet de bord poids, stocks,
      `cost_cents` et budget) â†’ policy unique **`campaign_templates: editors`**,
      miroir de `campaigns: editors` ; pgTAP inversÃ© (le caissier ne lit rien) +
      assertion de non-fuite du secret + contre-Ã©preuve Ã©diteur ;
      `campaign_templates` rejoint l'audit RLS central. INFO : `budget_cents` en
      `min(1)` (le CHECK SQL exige `> 0`)
- [x] QA : 29 tests d'action (invariants BROUILLON et INNOCUITÃ‰
      **mutation-testÃ©s**) + E2E `e2e/campaign-templates.spec.ts` (modÃ¨le â†’
      brouillon, preuve prise sur l'Ã‰TAT rÃ©el et non sur un message) ;
      1021 tests âœ“, typecheck âœ“, lint âœ“

**Suites ouvertes** :
- [ ] VÃ©rifier l'application de la migration `20260802120000` en production
      (code poussÃ© le 2026-07-25 ; EXPECTED_MIGRATION est depuis passÃ© Ã 
      `20260803120000` avec V1.16)
- [ ] RÃ©sidus assumÃ©s (docs/bugs.md) : blueprint privÃ© pouvant dÃ©crire une roue
      sans lot perdant, application non transactionnelle (brouillon orphelin),
      ni quota ni rate-limit sur les deux actions, secret de dÃ©fi dupliquÃ© dans
      le blueprint, capture de la seule roue principale, Â« Utiliser ce modÃ¨le Â»
      visible pour un caissier qui ne peut pas l'appliquer
- [ ] Place de marchÃ© PARTAGÃ‰E entre commerÃ§ants (Ã©cartÃ©e ici â€” modÃ©ration,
      isolation du contenu publiÃ©, propriÃ©tÃ© des visuels)

## V1.14 â€” Pronostics au-delÃ  du sport (âœ… 2026-07-24, **en production**)
**Objectif** : demande client â€” le moteur de pronostics cesse d'Ãªtre
football-centrÃ©. Il doit servir Ã  tout Ã©vÃ©nement Ã  rÃ©sultat (cÃ©rÃ©monie,
Eurovision, Ã©lection interne, remise de prix, compÃ©tition d'entreprise, concours
culinaire, finale d'Ã©mission, tournoi local, course, e-sport) sur le modÃ¨le
`Ã©vÃ©nement â†’ questions prÃ©dictives â†’ date de verrouillage â†’ rÃ©sultat â†’ barÃ¨me â†’
classement â†’ rÃ©compenses`. **Le football devient un modÃ¨le prÃ©configurÃ©, pas le
cÅ“ur technique.**

> âš ï¸ **Au 2026-07-24, seul chantier du projet NON DÃ‰PLOYÃ‰** : construit, QA
> verte, revue sÃ©curitÃ© passÃ©e de NO-GO Ã  corrigÃ© â€” mais les 8 commits
> (`4973736` â†’ `f09ee89`) Ã©taient LOCAUX et la migration `20260801120000`
> n'Ã©tait pas appliquÃ©e en production.
> **Au 2026-07-25, ces commits sont prÃ©sents sur `origin/main`** (donc poussÃ©s) ;
> le seul chantier NON POUSSÃ‰ est dÃ©sormais V1.15. L'application effective de la
> migration en production n'a pas Ã©tÃ© revÃ©rifiÃ©e.

- [x] **4 types de questions** (`contest_matches.question_type`) : `score`
      (deux camps â€” le football historique, inchangÃ©), `choice` (choix unique),
      `ranking` (ordre d'un top N), `number` (estimation) â€” ADR-038
- [x] **DB** â€” migration `20260801120000_generic_contests.sql` : `contests`
      (`event_kind` dÃ©faut `football`, `default_locks_at`, `scoring` Ã©tendu) ;
      `contest_matches` devient le REGISTRE DE QUESTIONS (`question_type`,
      `prompt`, `options`, `correct_answer`, `ranking_size`, `locks_at`) ;
      `contest_predictions` (scores NULLABLE + `answer jsonb`) ; RPC
      `submit_contest_answer`, `set_contest_question_result`,
      `update_contest_generic_scoring`, `update_contest_event_settings` ;
      barÃ¨me par type en SQL ; pgTAP `generic_contests.test.sql`
- [x] **Verrouillage par question** avec date par dÃ©faut au niveau de
      l'Ã©vÃ©nement : `score â†’ coalesce(locks_at, kickoff_at)`,
      `gÃ©nÃ©rique â†’ coalesce(locks_at, default_locks_at, kickoff_at)` â€” posÃ©
      dans les 4 fonctions SQL concernÃ©es ET dans le miroir TS
      `effectiveLocksAt` ; champ masquÃ© cÃ´tÃ© UI pour le football
- [x] **Backend** â€” barÃ¨me gÃ©nÃ©rique TS (miroir du SQL), validations Zod par
      type, actions questions/rÃ©ponses/rÃ©sultat, `publicCorrectAnswer` (point
      de sÃ©rialisation UNIQUE de la bonne rÃ©ponse)
- [x] **Frontend** â€” crÃ©ation d'Ã©vÃ©nement typÃ©e, rÃ©glages de verrouillage
      Ã©ditables aprÃ¨s crÃ©ation (Ã©vÃ©nement reportÃ©, auditÃ©s), constructeur de
      questions typÃ©es, saisie du rÃ©sultat par type, parcours joueur gÃ©nÃ©rique,
      `ranking-picker`
- [x] **11 modÃ¨les + `custom`** (`contest-event-kinds.ts`) : `football`,
      `ceremony`, `eurovision`, `election`, `remise_prix`, `entreprise`,
      `culinaire`, `emission`, `tournoi`, `course`, `esport` â€” questions
      suggÃ©rÃ©es et barÃ¨me conseillÃ©, **aucune option factice Ã©crite** (les
      listes restent saisies par le commerÃ§ant) ; synchro du fournisseur de
      calendriers rÃ©servÃ©e au football (double verrou)
- [x] **Revue sÃ©curitÃ© : NO-GO conditionnel â†’ corrigÃ©** (`f3c5752`). GO franc
      sur le volet gÃ©nÃ©rique ; blocage sur la NON-RÃ‰GRESSION football â€”
      **E1 (Ã‰LEVÃ‰)** : le backfill `locks_at = kickoff_at` figeait la fenÃªtre Ã 
      l'instant de la migration alors que la synchro ne met Ã  jour que
      `kickoff_at` (match reportÃ© â†’ pronostics fermÃ©s silencieusement sur un
      match non jouÃ© ; match avancÃ© â†’ base acceptant un pronostic pendant la
      rencontre) â†’ backfill supprimÃ©, repli sur `kickoff_at` ;
      **M1 (MOYEN)** : `default_locks_at` primait sur `kickoff_at` pour tous les
      types (une date par dÃ©faut fermait d'un coup tout un championnat importÃ©)
      â†’ jamais appliquÃ©e Ã  une question `score` ; volet UI du mÃªme correctif
      (`f09ee89`) : le champ Â« verrouillage par dÃ©faut Â» est masquÃ© sur le
      modÃ¨le football
- [x] CI : E2E `e2e/pronostics-generic.spec.ts` + seed `E2EPRONO3` ; pgTAP
      Â« match reportÃ© / avancÃ© / date par dÃ©faut ignorÃ©e Â» ; 5 tests TS

**Suites ouvertes** :
- [x] **PoussÃ©e le 2026-07-25** (les 8 commits sont sur `origin/main`) â€”
      **reste Ã  confirmer** l'application de la migration `20260801120000` en
      production
- [ ] M2 : `update_contest_event_settings` peut rouvrir une question dont
      `locks_at` est NULL en dÃ©plaÃ§ant `default_locks_at` (rÃ©sidu assumÃ©,
      docs/bugs.md)
- [ ] DÃ©partage d'ex Ã¦quo (`exact_count` / `diff_count`) par TYPE et non par
      palier â€” imprÃ©cis seulement sur un Ã©vÃ©nement mixte (ADR-013)
- [ ] Rapatrier les nouvelles RPC dans l'audit ACL central
      `security_acl.test.sql` (I4)
- [ ] Durcir `tiebreaker_answer` (chargÃ© dans le contexte public, jamais
      transmis â€” I5, prÃ©-existant)
- [ ] Trancher la fragilitÃ© E2E PRÃ‰-EXISTANTE `e2e/pronostics.spec.ts:40`
      (locator page-wide `/EnregistrÃ©|Modifier/` ambigu avec le bouton
      Â« Modifier Â» permanent du hub joueur)

## V1.13 â€” Jeux rapides : moteur de tirage partagÃ© + jeux skill-gated (âœ… 2026-07-24)
**Objectif** : demande client â€” ajouter BEAUCOUP de mini-jeux qui partagent le mÃªme
moteur de campagne (Â« ajouter un jeu = ajouter une interface Â»). Formaliser le point
d'extension existant `wheels.game_type` (V1.4) en socle et le dÃ©cliner en 13 nouveaux
jeux, en 2 vagues. **Vague 1 (7 jeux de rÃ©vÃ©lation) ET vague 2 (6 jeux de dÃ©fi
skill-gated) EN PRODUCTION.**

- [x] **Socle `<GameShell>`** extrait du grattage (`game-shell.tsx`) : factorise les
      Ã©tats idle / gagnÃ© / perdu / bloquÃ© et mutualise `spinWheel` / rÃ©clamation /
      partage / captcha / analytics / thÃ¨mes. Chaque jeu = `games/<jeu>-reveal.tsx`
      (animation) + `<jeu>-experience.tsx` (~12 lignes)
- [x] **Vague 1 â€” 7 jeux de RÃ‰VÃ‰LATION** (`flip_card`, `cups`, `slot`, `memory`,
      `chest`, `dice`, `draw_card`) : migration `20260730120000_quick_games_reveal.sql`
      (extension `wheels_game_type_check`). SERVEUR-AUTORITATIF â€” le lot vient de
      `spinWheel`, l'interaction ne fait que RÃ‰VÃ‰LER l'`outcome` (cosmÃ©tique, aucun
      poids au client). **DÃ©ployÃ©e** ; revue sÃ©curitÃ© vague 1 : GO 0 bloquant (ADR-037)
- [x] **Vague 2 â€” 6 jeux de DÃ‰FI *skill-gated*** (`rps`, `reflex`, `gauge`, `puzzle`,
      `mystery_word`, `estimate`) : migration `20260731120000_quick_games_skill.sql`
      (`game_type` Ã©tendu, colonne `skill_config jsonb` Ã  SECRETS server-only,
      `perform_atomic_spin` recrÃ©Ã©e en 7-args avec `p_force_losing` â€” corps normal
      identique, zÃ©ro rÃ©gression). Socle `<SkillGameShell>` Ã  2 temps +
      `games/<jeu>-challenge.tsx` (ADR-037)
- [x] **Moteur Ã  2 temps** (`src/lib/skill.ts` + `src/actions/skill.ts`) :
      `startSkillChallenge` prÃ©sente le dÃ©fi (vue publique sans secret) + jeton HMAC
      domaine-sÃ©parÃ© `skill-challenge:` liÃ© device ; `submitSkillChallenge` Ã‰VALUE le
      dÃ©fi CÃ”TÃ‰ SERVEUR puis `perform_atomic_spin(p_force_losing => !succeeded)`
      (rÃ©ussite â†’ tirage normal, Ã©chec â†’ spin perdant forcÃ©) â€” participation consommÃ©e
      dans les deux cas (anti-brute-force)
- [x] Ã‰diteur commerÃ§ant `wheel-settings.tsx` (sÃ©lecteur + sous-formulaire Â« RÃ©glages
      du dÃ©fi Â», secrets marquÃ©s) ; correctif d'un manque vague 1 (`ac27384`) :
      `updateWheel` refusait les nouveaux `game_type` â†’ enum complet
- [x] Revue sÃ©curitÃ© vague 2 : **NO-GO initial (1 Ã‰LEVÃ‰ + 1 MOYEN) â†’ corrigÃ©s â†’ GO**
      (`8a3c60e`) â€” Ã‰LEVÃ‰ : garde `isSkillGameType` dans `spinWheelInner` contre le
      contournement du dÃ©fi par appel direct ; MOYEN : `unlimited` interdit pour les
      jeux Ã  secret + oracle `succeeded` retirÃ© de la rÃ©ponse cliente. QA verte
- [x] Commits `d957f46`â†’`5710641` (vague 1), `125eb99`â†’`8a3c60e` (vague 2) ;
      EXPECTED_MIGRATION bumpÃ© Ã  `20260731120000`

**Suites ouvertes** :
- [ ] VÃ©rification serveur de `reflex` / `gauge` (rÃ©ussite *client-reported*
      aujourd'hui, bornÃ©e par l'Ã©conomie ADR-031 â€” docs/bugs.md)
- [ ] CI : pgTAP `quick_games_skill.test.sql` + E2E `skill-games.spec.ts` (Docker
      absent en local)
- [ ] RÃ©-essai aprÃ¨s erreur transitoire au submit d'un dÃ©fi (le composant se
      verrouille aujourd'hui ; recharger relance un dÃ©fi â€” docs/bugs.md)

## V1.12 â€” Parrainage ludique (âœ… 2026-07-24)
**Objectif** : un levier de croissance greffÃ© sur les campagnes ROUE â€” un joueur
satisfait devient PARRAIN et invite ses proches ; chaque filleul qui vient JOUER
fait progresser une jauge d'Â« Ã©quipe Â» partagÃ©e et dÃ©bloque des rÃ©compenses.
**En production** (revue sÃ©curitÃ© GO sans finding bloquant, QA verte).

- [x] Addon d'organisation `addon_referral` (miroir d'`addon_calendar`), activÃ©
      depuis le back-office admin, gating `hasReferralAccess` ; opt-in PAR CAMPAGNE
      (`referral_programs.enabled`) sur les campagnes roue (ADR-036)
- [x] Parrain : code partageable `PR-â€¦` â†’ lien `/play/[slug]?ref=PR-â€¦` (aucune
      nouvelle surface publique) ; panneau parrain sur la roue (CTA, partage,
      jauge/coffre/Ã©quipe)
- [x] Preuve = PARTICIPATION rÃ©elle, jamais un clic : `validate_referral` exige un
      `proof_spin_id` (spin rÃ©el du device filleul, non forgeable/non rejouable/
      unique), appelÃ© APRÃˆS le spin â€” un lien ouvert sans jouer ne vaut rien (ADR-036)
- [x] RÃ©compenses en CONFIG LIBRE, 3 versements indÃ©pendants (`none`/`spin`/`lot`) :
      parrain (par filleul), filleul (bienvenue), coffre collectif au seuil
      (`chest_threshold`, dÃ©faut 3) ; `lot` = code `PARRAIN-â€¦` Ã  STOCK FINI (ADR-031),
      `spin` = tour de roue offert (`spins.source = 'referral'`, ADR-029)
- [x] Â« Ã‰quipe Â» = parrain+filleuls Ã  jauge/coffre PARTAGÃ‰S, dÃ©bloquÃ© une seule fois
      au seuil ; PAS de classement (coopÃ©ratif, pas compÃ©titif)
- [x] Anti-abus 100 % serveur bornÃ© par l'Ã©conomie : self/boucle directe bloquÃ©s,
      1 filleul/campagne/device, fenÃªtre `window_days`, plafond `sponsor_max_filleuls`,
      no-oracle (`rejected` unique) + dÃ©fense en profondeur (`referral_public_state`
      re-gate) ; rate-limit ADR-032 (failClosed device, IP fail-open observe)
- [x] Caisse unifiÃ©e `source: 'referral'` (7e prÃ©fixe `PARRAIN-`,
      `redeem_referral_reward`, org-scopÃ©e/auditÃ©e) ; purge RGPD
      `purge_expired_referral_data` (cron purge-data)
- [x] Migration `20260729120000`, ADR-036 ; fix `getUserAndOrg` (sÃ©lectionnait tous
      les addons sauf `addon_referral`)
- [x] CI : `referral.test.sql` (pgTAP) + `e2e/referral.spec.ts` (Ã©diteur, parrain+
      lien, filleul post-spin, caisse double-retrait, axe) + seed `PARRAIN-E2ECHEST`
- [x] Revue sÃ©curitÃ© passÃ©e : verdict GO, 0 finding bloquant ; perte maximale bornÃ©e
      par le stock fini

**Suites ouvertes** :
- [ ] CÃ¢blage best-effort de l'email filleul au claim (activerait la dÃ©dup email SQL,
      aujourd'hui inerte car `validateReferral` prÃ©cÃ¨de la collecte d'email â€” ADR-036)
- [ ] Multi-commerces sur un mÃªme programme de parrainage (multi-tenant croisÃ©)
- [ ] Parrainage sur d'autres mÃ©caniques que la roue (chasse, jackpot, calendrier)

## V1.11 â€” Calendrier de l'Avent & campagnes quotidiennes (âœ… 2026-07-23)
**Objectif** : un module de gamification QUOTIDIEN Ã  mÃ©canique ANNUELLE â€” le
joueur, venu par le lien/QR du commerce, revient chaque jour ouvrir UNE case
(Avent, semaine anniversaire, compte Ã  rebours, 7 jours de cadeaux, festival,
lancement produit, semaine soldes) ou suit le calendrier Ã  distance via un rappel
email. **En production** (revue finale passÃ©e sans finding bloquant).

- [x] Addon d'organisation `addon_calendar` (miroir d'`addon_events`), activÃ©
      depuis le back-office admin, gating `hasCalendarAccess` (ADR-035)
- [x] 4 types de case (`content` / `lot` code `CADEAU-â€¦` / `spin` tour de roue
      offert, ADR-029) + rÃ©compense d'assiduitÃ© finale (toutes cases ouvertes) ;
      stock fini OBLIGATOIRE (ADR-031) ; case spÃ©ciale partageable
- [x] Gating temporel SERVEUR-AUTORITATIF : `open_calendar_box` tranche `now()`
      (base) vs `unlock_at` dÃ©rivÃ© serveur (minuit civil du fuseau, DST-robuste
      via `Intl`) â€” ouvrir une case en avance est impossible
- [x] Non-fuite du contenu d'une case non ouverte : quadruple dÃ©fense
      (`calendar_public_state` sans contenu + mapper null + `too_early` muet +
      RLS/grants)
- [x] Page publique suivable `/calendar/[slug]` installable (PWA, manifest par
      calendrier), 5 thÃ¨mes carton (neutre/noÃ«l/anniversaire/soldes/festival)
- [x] Rappel quotidien opt-in via cron `/api/cron/calendar-reminders`
      (`15 9 * * *`, dÃ©dup `email_log`) qui relaie l'archivage des calendriers
      Ã©coulÃ©s ; caisse unifiÃ©e (`source: 'calendar'`, `redeem_calendar_reward`,
      6 prÃ©fixes au total) ; purge RGPD `purge_expired_calendar_players`
- [x] Migration `20260728120000`, ADR-035 ; correctif anti-spoiler (`5c4d89f`)
      limitant le prÃ©chargement des roues aux cases dÃ©jÃ  ouvertes ; 775 tests
- [x] CI : `calendar.test.sql` (pgTAP) + `e2e/calendar.spec.ts` (grille + axe)

**Suites ouvertes** :
- [ ] Multi-commerces sur un mÃªme calendrier (multi-tenant croisÃ© â€” reportÃ©)
- [ ] Restreindre l'exposition des `dayIds` futurs (aujourd'hui neutralisÃ©e par
      `too_early` sans contenu â€” ADR-035, limite V1 assumÃ©e)
- [ ] Archivage/purge sans opt-in commerÃ§ant (aujourd'hui conditionnÃ©s Ã 
      `data_retention_months` â€” ADR-035)
- [ ] Autres calendriers rÃ©currents (hebdomadaire, mensuel) au-delÃ  de l'annuel

## V1.10 â€” Mode Ã©vÃ©nement en direct (âœ… 2026-07-23)
**Objectif** : une animation LIVE dans le commerce (bar, salle, sÃ©minaire) â€” un
organisateur enchaÃ®ne des questions face Ã  un public, l'Ã©cran de la salle affiche
la question, chaque client rÃ©pond sur son tÃ©lÃ©phone, un classement s'actualise en
direct. **En production** (revue sÃ©curitÃ© passÃ©e sans finding bloquant).
- [x] Addon `addon_events` + gating `hasEventsAccess` + toggle back-office
- [x] Moteur Â« question Â» gÃ©nÃ©rique : quiz / sondage / pronostic (un seul chemin)
- [x] SÃ©paration CONTENU (`event_games`/`questions`/`options`) et RUN
      (`event_sessions`/`players`/`answers`/`wins`)
- [x] Machine Ã  Ã©tats serveur `lobbyâ†’question_activeâ†’question_lockedâ†’revealâ†’leaderboardâ†’ended`
- [x] 3 interfaces synchronisÃ©es : Ã©cran public, tÃ©lÃ©phone joueur (pseudo+avatar), tÃ©lÃ©commande orga
- [x] Invariant non-fuite de la bonne rÃ©ponse (4 dÃ©fenses) + scoring serveur-autoritatif
- [x] Transport : polling primaire (`event_public_state`) + Realtime ping-only activable
- [x] Podium Ã  l'Ã©cran + lot `EVENT-` (stock fini, ADR-031) en caisse unifiÃ©e
- [x] Migration `20260727120000`, ADR-034 â€” CI verte, dÃ©ployÃ©

**Suites ouvertes (V2)** :
- [ ] Autres modes greffÃ©s sur le squelette : blind test (question + mÃ©dia audio),
      bingo, roue gÃ©ante pilotÃ©e depuis l'Ã©cran, bataille 2 Ã©quipes
- [ ] Tirage au sort parmi les participants (en plus du podium au score)
- [ ] Turnstile optionnel au 1er join (anti-sybil, clÃ© identitÃ© â€” ADR-032) pour les Ã©vÃ©nements Ã  fort enjeu
- [ ] Activation du transport Realtime en production (`EVENTS_REALTIME_ENABLED`)
- [ ] Titre de session/jeu exposÃ© aux surfaces publiques
- [ ] Multi-commerces sur un mÃªme Ã©vÃ©nement (multi-tenant croisÃ©)

## V1.9 â€” Jackpot collectif (âœ… 2026-07-23)
**Objectif** : une nouvelle mÃ©canique de jeu â€” une CAGNOTTE COLLECTIVE : tous
les clients d'un commerce alimentent une mÃªme jauge partagÃ©e (chaque
participation validÃ©e = +1), et le gain se dÃ©clenche au niveau de cette jauge.
**En production** (revue sÃ©curitÃ© passÃ©e, 2 bloquants corrigÃ©s et
vÃ©rifiÃ©s).

- [x] Addon d'organisation `addon_jackpot` (miroir d'`addon_loyalty`), activÃ©
      depuis le back-office admin, gating `hasJackpotAccess` (ADR-033)
- [x] Jauge PARTAGÃ‰E `current_count` incrÃ©mentÃ©e sous verrou de campagne,
      affichÃ©e en temps rÃ©el ; montant d'affichage croissant cosmÃ©tique
- [x] Anti-triche rÃ©utilisÃ© du Passeport (ADR-030) : `validation_mode`
      `rotating_code` (code TOTP sur Ã©cran comptoir) ou `staff` (jeton de
      check-in signÃ©, domaine `jackpot-checkin:`), cooldown par joueur â‰¥ 300 s
- [x] 3 modes de tirage (`draw_mode`) : `threshold_draw` (auto au seuil),
      `rescan_win` (armÃ© â†’ chance instantanÃ©e par scan), `date_draw`
      (cron `jackpot-draws`)
- [x] Tirage ATOMIQUE (verrou + `unique(campaign_id, cycle)`) et VÃ‰RIFIABLE
      (`draw_seed` journalisÃ©, `gen_random_bytes`) ; rÃ©compense = lot unique
      `JACKPOT-â€¦` en caisse ; stock fini OBLIGATOIRE (ADR-031)
- [x] Page publique suivable `/jackpot/[id]` installable (PWA, manifest par
      campagne) + bloc contenu commerÃ§ant ; Ã©cran comptoir temps rÃ©el ;
      caisse unifiÃ©e (`source: 'jackpot'`, RPC `redeem_jackpot_prize`)
- [x] `record_jackpot_participation` (tout atomique sous verrou), purge RGPD
      `purge_expired_jackpot_players` (conserve les hashes anonymes de tirage)
- [x] CI : `jackpot.test.sql` (pgTAP) + `e2e/jackpot.spec.ts` (page suivable :
      affichage + axe + 404) ; `security_acl.test.sql` Ã©tendu
- [x] Revue sÃ©curitÃ© passÃ©e : CRITIQUE-1 corrigÃ© (code du gagnant fuitÃ© au
      dÃ©clencheur du seuil â†’ code rÃ©servÃ© au gagnant, 2 couches) + Ã‰LEVÃ‰-1
      corrigÃ© (date_draw re-tirait Ã  chaque cron â†’ tirage unique)

**Suites ouvertes** :
- [ ] Multi-commerces sur une mÃªme jauge (multi-tenant croisÃ© â€” reportÃ©, ADR-033)
- [ ] Ã‰tat Â« tirage effectuÃ© Â» sur la page publique aprÃ¨s un `date_draw`
- [ ] Stopper les participations aprÃ¨s `draw_at` (aujourd'hui elles
      incrÃ©mentent la jauge cosmÃ©tique sans gain â€” limite V1 assumÃ©e)
- [ ] Stock rÃ©siduel d'un `date_draw` non distribuÃ© (tirage unique â€” limite V1)

## Quick wins maintenabilitÃ© & accessibilitÃ© (âœ… 2026-07-21)
Issus de l'audit maintenabilitÃ© (commits `a5fc2cb`, `b7db502` ; 324 tests,
build OK).

- [x] **Types Supabase gÃ©nÃ©rÃ©s** : snapshot commitÃ©
      `src/types/database.generated.ts` (`npm run types:generate`, source
      `--linked`) + garde CI anti-dÃ©rive dans le job `database-security`
      (rÃ©gÃ©nÃ©ration `--local` puis `git diff --exit-code -I 'PostgrestVersion'`).
      Nouveau rÃ©flexe dev : migration â†’ `npm run types:generate` â†’ commit,
      sinon CI rouge. `src/types/database.ts` reste maintenu Ã  la main
      (en-tÃªte ajoutÃ©) ; migration progressive vers les types gÃ©nÃ©rÃ©s.
- [x] **A11y roue** : `prefers-reduced-motion` respectÃ© â€” durÃ©e du spin
      rÃ©duite Ã  la source (4400 â†’ 300 ms, 1 tour, easing linÃ©aire) via hook
      matchMedia sans mismatch d'hydratation (`play-experience.tsx`, prop
      `reducedMotion` de `wheel-svg.tsx`). Carte Ã  gratter vÃ©rifiÃ©e non
      concernÃ©e.
- [x] **A11y onglets Player Hub** : pattern WAI-ARIA Tabs complet â€” roving
      tabIndex, ArrowLeft/Right avec wrap, Home/End, focus suivant la
      sÃ©lection. Helper pur `src/components/pronos/tab-nav.ts` + 8 tests.

### Volet 2 â€” accessibilitÃ© (âœ… 2026-07-21)
Commits `ce2eb78`, `bc9615c`, `028717d` (338 tests, build OK ; exÃ©cution
rÃ©elle des scans axe Ã  confirmer au premier run CI E2E). Le bloc
accessibilitÃ© de l'audit est dÃ©sormais entiÃ¨rement traitÃ©.

- [x] **Contraste automatique roue** : `src/lib/contrast.ts`
      (luminance/ratio WCAG), `labelColor: "auto"` par dÃ©faut des styles
      vierges uniquement (hex existants intacts), calcul par segment dans
      `wheel-svg.tsx`, case Â« Contraste auto Â» + avertissement < 3:1 dans
      le Studio.
- [x] **Lien d'Ã©vitement** : `src/components/ui/skip-link.tsx`, posÃ© sur
      landing, dashboard, `/play/[slug]` et `/pronos/[slug]`
      (`<main id="contenu" tabIndex={-1}>`).
- [x] **axe-core dans Playwright** : `@axe-core/playwright`, helper
      `e2e/axe.ts` (Ã©chec serious/critical, moderate/minor loggÃ©es, zÃ©ro
      rÃ¨gle exclue) ; scans intÃ©grÃ©s aux specs player-win, pronostics,
      roles + spec dÃ©diÃ©e `e2e/a11y.spec.ts` pour la landing.
- [x] **Vraies violations corrigÃ©es au passage** (`bc9615c`) :
      3 contrastes `bg-k-green` sur la landing (texte passÃ© Ã  4.59:1) +
      `aria-label` sur l'input code du poste caisse.

## Refactoring opportuniste (rÃ¨gles au fil de l'eau)
Issues de l'audit maintenabilitÃ© (2026-07-21). Ã€ appliquer **quand on
retouche le fichier concernÃ©**, jamais en big-bang :

- [ ] DÃ©couper `src/actions/pronostics.ts` (1480 l) par domaine :
      matches / leagues / player
- [ ] DÃ©couper `src/lib/resend.ts` (888 l) par domaine d'email
- [ ] DÃ©couper `poster-editor.tsx` (807 l) et `src/app/page.tsx` (990 l)
- [ ] Extraire les avatars de `src/lib/avatars.tsx` (786 l) en catalogue lazy
- [ ] Migrer progressivement `src/types/database.ts` (manuel) vers les types
      gÃ©nÃ©rÃ©s `database.generated.ts`
- [x] Ajouter axe-core aux tests Playwright (âœ… 2026-07-21, volet 2 a11y)

**ReportÃ©s en arbitrage produit** :
- [ ] Undo/redo + autosave des Ã©diteurs (selon feedback bÃªta)
- [ ] DÃ©dup marketing app/site + prix partagÃ©s Stripe â†” site + domaine
      canonique (avant ouverture publique)
- [x] Contraste automatique des segments de roue (âœ… 2026-07-21, finalement
      livrÃ© au volet 2 a11y)

## V1.2 â€” AprÃ¨s le pilote (Ã  prioriser selon retours)
- [x] Scan camÃ©ra du code gain cÃ´tÃ© staff (scanner en caisse : BarcodeDetector
      natif + repli jsQR, Permissions-Policy camera=(self), E2E dÃ©diÃ© avec
      flux camÃ©ra simulÃ©)
- [x] Multi-roues par campagne / planification horaire (roues multiples
      avec planning heures/jours via `selectActiveWheel` ; programmation
      de campagne ajoutÃ©e en V1.6)
- [x] Segments et automatisations sur la newsletter (segments livrÃ©s avec
      la file de travaux ; scÃ©narios automatisÃ©s livrÃ©s en V1.6)
- [ ] Offres Stripe multiples (Pro : quotas, multi-Ã©tablissements)
- [x] Captcha Turnstile obligatoire en production, sauf opt-out explicite
- [ ] Suppression/anonymisation RGPD self-service

## V2 â€” Croissance
- [x] Autres mÃ©caniques de jeu (jackpot collectif â€” V1.9, âœ… 2026-07-23)
- [x] RÃ´les staff avec permissions rÃ©duites (caisse, campagnes et QR)
- [ ] API publique / intÃ©grations (POS, CRM)
- [ ] Facturation Ã  l'usage

## Blockers actuels
- Aucun. La production tourne (dÃ©ploiement Vercel manuel via `vercel --prod`,
  plan Hobby : crons quotidiens uniquement) ; comptes Supabase / Stripe /
  Resend crÃ©Ã©s et variables d'environnement renseignÃ©es.
