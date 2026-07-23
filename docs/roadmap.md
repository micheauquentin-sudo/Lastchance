# Roadmap — Lastchance

## V1 — MVP SaaS (✅ livrée)
**Objectif** : MVP robuste testable chez un premier commerce réel.

- [x] Architecture propre (Next.js App Router + Server Actions)
- [x] Base de données multi-tenant + RLS (testée sur PostgreSQL 16)
- [x] Authentification Supabase + onboarding organisation
- [x] Dashboard commerçant (campagnes, roue, lots, stats)
- [x] Roue entièrement configurable (poids, stocks, couleurs, perdants)
- [x] Parcours joueur complet (spin serveur → formulaire RGPD → code)
- [x] Génération de QR codes (PNG imprimables, compteur de scans)
- [x] Participations : validation des gains, export CSV
- [x] Stripe : checkout, portail, webhook, gating automatique
- [x] Emails de gain (Resend) + analytics (PostHog)
- [x] Prêt pour déploiement Vercel (guide dans README)

## V1 polish — Préparation bêta privée (✅ 2026-07-10)
**Objectif** : lisser l'usage quotidien du commerçant avant le pilote.

- [x] Participations : filtre « À valider / Récupérés » + recherche par
      code, prénom ou email (terme neutralisé contre l'injection PostgREST)
- [x] Dashboard : carte « Gains à valider » cliquable + taux de gagnants
- [x] Liste des campagnes : tours joués, gains et « à valider » par campagne
- [x] QR codes : affiche A4 imprimable (`/poster/[id]`, route protégée)
- [x] Tests unitaires ajoutés (`utils.test.ts` : sanitisation de recherche,
      slugify, codes de gain)

## V1.1 — Branding & personnalisation (✅ 2026-07-10)
**Objectif** : que la roue et l'affiche ressemblent au commerce, pas au SaaS.

- [x] Logo d'établissement (upload dans Réglages, Supabase Storage,
      affiché sur /play après le scan et sur l'affiche)
- [x] Personnalisation complète de la roue : 6 presets mélangeables
      (Classique, Néon, Luxe, Pastel, Minimal, Festif) + réglage fin de
      chaque détail — anneau (5 styles), ampoules (2 couleurs), bordures
      de segments, texte des lots, moyeu (4 styles), pointeur (3 formes),
      7 polices (Google Fonts chargées à la demande), fond de page,
      dégradé du bouton, accroche personnalisée — aperçu fidèle en direct
- [x] Éditeur d'affiche (`/poster/[id]`) : 4 modèles, fond dégradé,
      couleurs texte/accent, polices, tous les textes éditables, taille
      du QR, logo/nom/étapes affichables — sauvegarde par QR code,
      impression A4 (seule l'affiche sort)
- [x] Page Caisse (`/dashboard/redeem`) : validation d'un code en un
      geste, mobile-first, codes normalisés (« gain ab2c » → GAIN-AB2C)
- [x] Rate limiting renforcé Upstash (opt-in par env, REST sans
      dépendance, repli automatique sur le compteur en base)
- [x] Tests E2E Playwright du parcours joueur (skip propre sans env de
      staging ; vérifie aussi que les probabilités ne fuitent pas)

## V1.1.1 — Landing marketing premium (✅ 2026-07-11)
**Objectif** : faire ressentir la valeur du produit dès les premières
secondes et inspirer confiance aux commerçants (référence : Stripe,
Linear, Vercel). Aucune logique métier touchée.

- [x] Refonte complète de la page d'accueil en dark premium : hero avec
      la vraie roue du produit (composant partagé avec /play) en rotation
      lente + cartes flottantes du parcours joueur
- [x] Header sticky avec flou, ancres de sections et menu mobile
      accessible (aria-expanded, Échap, scroll verrouillé)
- [x] Sections marketing : cibles commerces, « Comment ça marche » en
      3 étapes, grille de 6 fonctionnalités, aperçu stylisé du dashboard,
      tarif unique (29 €/mois, 7 jours d'essai), FAQ en accordéons, CTA
      final
- [x] Animations et micro-interactions : entrées au chargement,
      révélations au scroll (IntersectionObserver), survols des cartes et
      boutons, balayage lumineux sur le CTA — le tout neutralisé par
      `prefers-reduced-motion`
- [x] Accessibilité : lien d'évitement, landmarks, focus visibles,
      contrastes AA sur fond sombre ; responsive vérifié (390 px → 1440 px,
      captures Playwright)

## V1.1.2 — Landing v2, identité unique en mouvement (✅ 2026-07-11)
**Objectif** : une identité unique (pas un template SaaS), sobre,
moderne et fidèle à la direction artistique du jeu, avec un site
« en mouvement » quand le visiteur se déplace.

- [x] Direction artistique moderne : noir profond, accents
      violet/fuchsia, Geist en titres, serif italique Fraunces réservée
      à l'accent du hero, grain photographique léger
- [x] Roue-horizon épurée qui tourne au rythme du scroll
      (rAF, sans re-render ; vérifié : 0° → 126° après 900 px)
- [x] Ticker infini des lots, manifeste qui s'allume mot à mot au
      scroll, étapes éditoriales à grands numéros en contour
- [x] Micro-interactions : cartes inclinables, halo doré suivant le
      curseur (tarifs), CTA magnétique avec balayage lumineux
- [x] `prefers-reduced-motion` neutralise toutes les animations ;
      accessibilité et responsive conservés (captures 390 px / 1440 px)

## V1.1.3 — Landing v3, thème clair ludique + hero interactif (✅ 2026-07-11)
**Objectif** : reproduire fidèlement une maquette de référence (thème
clair chaleureux, roue + téléphone), avec une roue qui tourne pour de
vrai et un écran de téléphone interactif.

- [x] Direction artistique claire et chaleureuse : fond dégradé
      rose/magenta → pêche/crème, titres Poppins, accent italique
      Fraunces, palette orange/rose/ambre, étincelles décoratives
- [x] Hero interactif sur mesure : roue SVG (bezel sombre, ampoules,
      moyeu « Last Chance. », pointeur doré) en rotation lente
      permanente + lancer animé jusqu'au lot ; le téléphone pilote la
      démo (bouton « Tourner la roue » → état en cours → résultat avec
      code de gain + bouton Rejouer). QR décoratif déterministe.
      Vérifié Playwright : rotation réelle + écran passant au résultat,
      cohérent avec la position de la roue
- [x] Barre de confiance (4 atouts), « Comment ça marche » en 3 étapes
      avec flèches pointillées animées et visuels (présentoir QR,
      téléphone-roue, carte stats), grille fonctionnalités
- [x] Aperçu dashboard complet : sidebar, 4 KPI, courbe des
      participations (SVG) + donut « Top gains » avec légende
- [x] Tarif unique, FAQ, CTA final dégradé, footer — tous en thème clair
- [x] `prefers-reduced-motion` neutralise roue, étincelles et flèches ;
      accessibilité (dropdown Ressources, focus, skip link) et responsive
      vérifiés (390 px / 1440 px)

## V1.3 — Back-office d'administration (✅ 2026-07-12)
**Objectif** : une console interne réservée à l'équipe LastChance,
totalement séparée de l'app commerçant (design sombre type Stripe /
Vercel / Supabase Studio). Voir [docs/admin-backoffice.md](./admin-backoffice.md).

- [x] 8 modules : Dashboard (MRR/ARR, abonnements, stats), Commerçants
      (liste + fiche + actions), Support, Stripe, Analytics, Audit Logs,
      Monitoring, Paramètres
- [x] RBAC 5 rôles (Super Admin, Admin, Support, Finance, Lecture seule)
      avec matrice de permissions unique et testée (13 cas)
- [x] Sécurité : tables verrouillées (RLS sans policy, service role
      only), double barrière (session + admin_users actif), garde de
      page + garde d'action, validation zod
- [x] Anti-escalade : rôle ≤ le sien, pas d'auto-gestion, dernier
      super_admin protégé (anti-verrouillage)
- [x] Audit complet des actions sensibles (acteur, cible, avant/après, IP)
- [x] Amorçage du premier super_admin par fonction SQL dédiée
- [x] Vérifié : typecheck, lint, 126 tests, build (routes /admin
      dynamiques), captures desktop + mobile

## V1.4 — Fidélisation & différenciation (✅ 2026-07-12)
**Objectif** : fermer la boucle de fidélisation (la donnée collectée sert
enfin à quelque chose), donner une vue relationnelle des clients, mettre
en avant l'absence de review-gating comme argument commercial, et
diversifier la mécanique de jeu. Voir l'analyse concurrentielle qui a
motivé ces choix (comparaison directe avec les solutions du marché
positionnées sur « avis Google contre roue »).

- [x] **Newsletter** — `/dashboard/newsletter` : composer + historique
      d'envois, emails par lots (Resend batch API), désinscription en un
      clic (jeton HMAC signé, sans expiration, sans session), rate limit
      anti-abus (5 envois/jour/org). Compteur d'abonnés actifs affiché
      dans Participations avec lien direct.
- [x] **Profil client** — `/dashboard/customers` : agrégat des gains par
      email (RPC `org_customer_profiles`, vérification d'appartenance
      intégrée), segments actionnables (Nouveau / Fidèle / À relancer
      avec lien direct vers la newsletter).
- [x] **Argument anti review-gating** — section dédiée sur la landing
      (« Un jeu honnête, pas un piège à avis ») expliquant le risque réel
      (règles Google Business Profile) pris par les solutions qui
      conditionnent le gain à un avis. Différenciateur déjà présent dans
      le produit, jusqu'ici enterré en pied de page.
- [x] **Carte à gratter** — deuxième mécanique de jeu, entièrement
      découplée du tirage serveur (`wheels.game_type`, aucun changement
      au flux anti-triche/claim). Canvas HTML avec grattage tactile/souris
      (composite `destination-out`, révélation auto à 50 % gratté) +
      bouton « Révéler directement » pour l'accessibilité. Sélecteur
      Roue/Carte dans les réglages de campagne.
- [x] Vérifié : typecheck, lint, 130 tests, build (nouvelles routes
      dynamiques), geste de grattage simulé et révélation confirmée
      (Playwright), captures desktop de la landing et des réglages.

## V1.5 — Studio créatif & Pronostics (✅ 2026-07-18)

- [x] Preset de roue Kermesse aligné sur la direction artistique du produit.
- [x] Studio QR : huit motifs, quatre styles d'yeux, dégradés, logo réglable,
      bannière et export PNG jusqu'à 2048 px, avec garde de contraste.
- [x] Éditeur d'affiche libre : calques, glisser-déposer, redimensionnement,
      rotation, 18 formes, images rognables, 28 polices et quatre modèles.
- [x] Addon Pronostics : compétitions cataloguées ou libres, inscription,
      grilles, résultats, classement, barème et récompenses.
- [x] Durcissement : Turnstile, PII owner-only, intégrité multi-tenant,
      fermeture et scoring transactionnels, consentement et purge RGPD.

## V1.6 — Pronostics avancé & Automatisations commerçant (✅ 2026-07-21)
**Objectif** : faire vivre un championnat en boutique (ligues, écran TV,
saisie sans friction) et donner au commerçant des automatismes qui
travaillent pour lui (budget, programmation, stock, cycle de vie client).

- [x] Pronostics — saisie rapide des matchs en lot (1 à 30, tout-ou-rien,
      duplication de date, erreurs par ligne)
- [x] Pronostics — barre de progression « X/Y pronostics complétés »
- [x] Pronostics — mode TV plein écran (`/pronos/[slug]/tv`, polling 45 s,
      rotation de pages, podium ; JSON public top 30 sans PII, cache CDN
      30 s — ADR-022)
- [x] Pronostics — ligues privées (création, code d'invitation, quitter,
      classement re-numéroté 1..n — ADR-020, rate limits dédiés)
- [x] Campagnes — programmation automatique (`auto_schedule`, pg_cron SQL
      direct toutes les 10 min selon starts_at/ends_at)
- [x] Campagnes — budget de gains avec pause automatique à l'atteinte et
      relance manuelle (ADR-018)
- [x] Lots — seuil d'alerte stock + email commerçant (trigger réarmé au
      restock)
- [x] 3 scénarios cycle de vie client (gain non retiré, inactifs 30/60 j,
      post-retrait) dédupliqués par `email_log`, cron quotidien 09:30
- [x] Scénario anniversaire à double consentement (case dédiée sous
      l'opt-in marketing, fuseau de l'organisation — ADR-019)
- [x] Revue sécurité passée (0 critique/élevé) ; finding moyen corrigé :
      garde owner/editor sur `updateCampaignAutomation` et
      `resumeCampaignAfterBudget`

**Suites ouvertes** :
- [ ] Arbitrage produit reengage / scénario inactive (coexistence assumée
      avec avertissement UI — ADR-021)
- [ ] Minimisation `birth_date` (jour + mois suffiraient — ADR-019)
- [ ] Durcissement : ne poser `birth_date` que sur une ligne créée par le
      claim (FAIBLE assumé, docs/bugs.md)
- [ ] CI : exécuter pgTAP (`supabase test db`) et les 73 E2E Playwright
      (non exécutés localement, Docker absent — `--list` OK)

## V1.7 — Chasse au trésor multi-QR (✅ 2026-07-22)
**Objectif** : un nouveau module de jeu (comparable à Pronostics) — un
parcours de QR codes à travers la boutique ou le quartier, menant à un lot
final retiré en caisse.

- [x] Addon d'organisation `addon_hunts` (miroir d'`addon_pronostics`),
      activé depuis le back-office admin, gating `hasHuntsAccess` (ADR-023)
- [x] Chasse de 2 à 10 étapes, ordre libre ou imposé, fenêtre de dates
      optionnelle, indice optionnel révélé après chaque étape, délai minimal
      optionnel entre scans (anti-partage, sans géolocalisation — ADR-026)
- [x] Parcours joueur `/hunt/[token]` : scan → « Valider mon passage »
      (POST, anti-prefetch) → tampon + indice → complétion. Identité par
      cookie HTTP-only + hash (miroir contest, aucune PII)
- [x] `record_hunt_scan` atomique sous verrou de chasse : tampon idempotent,
      ordre, délai, complétion + code `CHASSE-…` + stock optionnel dans une
      transaction
- [x] Récompense = lot direct avec code de retrait (pas de roue — ADR-023) ;
      email de rappel optionnel à usage unique (ADR-024)
- [x] Caisse unifiée roue/chasse (`CashierMatch` discriminé par `source`) ;
      remise par RPC dédiée `redeem_hunt_completion` (atomique, auditée)
- [x] Éditeur commerçant (chasse, étapes, réordonnancement, affiches QR par
      étape), back-office addon, purge RGPD `purge_expired_hunt_players`
- [x] CI : `hunts.test.sql` (pgTAP) + `e2e/hunt.spec.ts` (parcours complet +
      scans axe-core) ajoutés ; `automation.test.sql` rebranché au job pgTAP
- [x] Revue sécurité passée : 1 ÉLEVÉ corrigé (claim email à usage unique),
      1 MOYEN corrigé (rate-limit de scan recalibré pour IP partagée — ADR-025)

**Suites ouvertes** :
- [ ] Multi-commerçants partenaires (chasse de quartier, multi-tenant
      croisé — reporté, ADR-027)
- [ ] Mini-jeux d'étape (au-delà du simple tampon)
- [ ] Récompenses intermédiaires (paliers avant le lot final)
- [ ] Défaut `min_scan_interval_seconds` > 0 à l'étude (ADR-026)

## V1.8 — Passeport de fidélité ludique (✅ 2026-07-22, GA 2026-07-23)
**Objectif** : un module de fidélisation (comparable à Pronostics/Chasse) — le
client cumule des visites sur un passeport dématérialisé, débloque des niveaux
et des paliers récompensés en boutique. **Livré en production, qualité GA.**

- [x] Addon d'organisation `addon_loyalty` (miroir d'`addon_hunts`), activé
      depuis le back-office admin, gating `hasLoyaltyAccess` (ADR-028)
- [x] Cumul de visites → tampon numérique ; niveaux bronze/argent/or calqués
      sur le compteur (seuils configurables)
- [x] Deux modes de validation au choix du commerçant : code tournant type
      TOTP sur écran comptoir (secret jamais exposé) et validation staff
      owner/editor/cashier en caisse ; cooldown anti-abus (ADR-030)
- [x] Paliers à récompense MIXTE, tous à STOCK FINI OBLIGATOIRE et palier ≥
      visite 2 : lot direct (code `FIDELITE-…` remis en caisse) ou tour de roue
      offert (grant à usage unique → tirage atomique → flux de gain normal, code
      `GAIN-…`) (ADR-028, ADR-029, ADR-031)
- [x] Parcours joueur `/passeport/[programId]` (identité cookie HTTP-only +
      hash, aucune PII), écran comptoir, éditeur commerçant, caisse unifiée
      (`source: 'loyalty'`), back-office addon, purge RGPD
      `purge_expired_loyalty_members`
- [x] CI : `loyalty.test.sql` (pgTAP) + `e2e/loyalty.spec.ts` (parcours + scan
      axe-core, smoke 404) ; `security_acl.test.sql` étendu
- [x] Durcissement pré-GA (8 revues sécurité, 2026-07-22 → 2026-07-23) : jeton
      de check-in signé TTL 3 min en mode staff (au lieu du bearer 180 j
      photographiable), planchers de cooldown durcis en base (staff 300 s,
      rotating `max(2 × période, 300 s)`), verrous économiques (stock fini,
      palier ≥ 2, bornes du palier spin), retrait des seaux « kill-switch »
      (ADR-030, ADR-031, ADR-032 — détail docs/bugs.md)
- [x] Revue sécurité : verdict GA, 0 finding bloquant ; perte maximale bornée
      ≈ 150 € par les verrous économiques

**Suites ouvertes** :
- [ ] Purge de la dette rate-limit `hunt` / `prono` / `spin` (seaux `failClosed`
      sur clé partagée — ADR-032 ; en cours dans un chantier séparé)
- [ ] Séries de visites (streak) et bonus d'assiduité
- [ ] Multiplicateurs / missions heures creuses
- [ ] Collection / badges à débloquer
- [ ] Bonus multi-établissements (multi-tenant croisé — reporté avec ADR-028)

## V1.9 — Jackpot collectif (✅ 2026-07-23)
**Objectif** : une nouvelle mécanique de jeu — une CAGNOTTE COLLECTIVE : tous
les clients d'un commerce alimentent une même jauge partagée (chaque
participation validée = +1), et le gain se déclenche au niveau de cette jauge.
**Prêt pour la production** (revue sécurité passée, 2 bloquants corrigés et
vérifiés).

- [x] Addon d'organisation `addon_jackpot` (miroir d'`addon_loyalty`), activé
      depuis le back-office admin, gating `hasJackpotAccess` (ADR-033)
- [x] Jauge PARTAGÉE `current_count` incrémentée sous verrou de campagne,
      affichée en temps réel ; montant d'affichage croissant cosmétique
- [x] Anti-triche réutilisé du Passeport (ADR-030) : `validation_mode`
      `rotating_code` (code TOTP sur écran comptoir) ou `staff` (jeton de
      check-in signé, domaine `jackpot-checkin:`), cooldown par joueur ≥ 300 s
- [x] 3 modes de tirage (`draw_mode`) : `threshold_draw` (auto au seuil),
      `rescan_win` (armé → chance instantanée par scan), `date_draw`
      (cron `jackpot-draws`)
- [x] Tirage ATOMIQUE (verrou + `unique(campaign_id, cycle)`) et VÉRIFIABLE
      (`draw_seed` journalisé, `gen_random_bytes`) ; récompense = lot unique
      `JACKPOT-…` en caisse ; stock fini OBLIGATOIRE (ADR-031)
- [x] Page publique suivable `/jackpot/[id]` installable (PWA, manifest par
      campagne) + bloc contenu commerçant ; écran comptoir temps réel ;
      caisse unifiée (`source: 'jackpot'`, RPC `redeem_jackpot_prize`)
- [x] `record_jackpot_participation` (tout atomique sous verrou), purge RGPD
      `purge_expired_jackpot_players` (conserve les hashes anonymes de tirage)
- [x] CI : `jackpot.test.sql` (pgTAP) + `e2e/jackpot.spec.ts` (page suivable :
      affichage + axe + 404) ; `security_acl.test.sql` étendu
- [x] Revue sécurité passée : CRITIQUE-1 corrigé (code du gagnant fuité au
      déclencheur du seuil → code réservé au gagnant, 2 couches) + ÉLEVÉ-1
      corrigé (date_draw re-tirait à chaque cron → tirage unique)

**Suites ouvertes** :
- [ ] Multi-commerces sur une même jauge (multi-tenant croisé — reporté, ADR-033)
- [ ] État « tirage effectué » sur la page publique après un `date_draw`
- [ ] Stopper les participations après `draw_at` (aujourd'hui elles
      incrémentent la jauge cosmétique sans gain — limite V1 assumée)
- [ ] Stock résiduel d'un `date_draw` non distribué (tirage unique — limite V1)

## Quick wins maintenabilité & accessibilité (✅ 2026-07-21)
Issus de l'audit maintenabilité (commits `a5fc2cb`, `b7db502` ; 324 tests,
build OK).

- [x] **Types Supabase générés** : snapshot commité
      `src/types/database.generated.ts` (`npm run types:generate`, source
      `--linked`) + garde CI anti-dérive dans le job `database-security`
      (régénération `--local` puis `git diff --exit-code -I 'PostgrestVersion'`).
      Nouveau réflexe dev : migration → `npm run types:generate` → commit,
      sinon CI rouge. `src/types/database.ts` reste maintenu à la main
      (en-tête ajouté) ; migration progressive vers les types générés.
- [x] **A11y roue** : `prefers-reduced-motion` respecté — durée du spin
      réduite à la source (4400 → 300 ms, 1 tour, easing linéaire) via hook
      matchMedia sans mismatch d'hydratation (`play-experience.tsx`, prop
      `reducedMotion` de `wheel-svg.tsx`). Carte à gratter vérifiée non
      concernée.
- [x] **A11y onglets Player Hub** : pattern WAI-ARIA Tabs complet — roving
      tabIndex, ArrowLeft/Right avec wrap, Home/End, focus suivant la
      sélection. Helper pur `src/components/pronos/tab-nav.ts` + 8 tests.

### Volet 2 — accessibilité (✅ 2026-07-21)
Commits `ce2eb78`, `bc9615c`, `028717d` (338 tests, build OK ; exécution
réelle des scans axe à confirmer au premier run CI E2E). Le bloc
accessibilité de l'audit est désormais entièrement traité.

- [x] **Contraste automatique roue** : `src/lib/contrast.ts`
      (luminance/ratio WCAG), `labelColor: "auto"` par défaut des styles
      vierges uniquement (hex existants intacts), calcul par segment dans
      `wheel-svg.tsx`, case « Contraste auto » + avertissement < 3:1 dans
      le Studio.
- [x] **Lien d'évitement** : `src/components/ui/skip-link.tsx`, posé sur
      landing, dashboard, `/play/[slug]` et `/pronos/[slug]`
      (`<main id="contenu" tabIndex={-1}>`).
- [x] **axe-core dans Playwright** : `@axe-core/playwright`, helper
      `e2e/axe.ts` (échec serious/critical, moderate/minor loggées, zéro
      règle exclue) ; scans intégrés aux specs player-win, pronostics,
      roles + spec dédiée `e2e/a11y.spec.ts` pour la landing.
- [x] **Vraies violations corrigées au passage** (`bc9615c`) :
      3 contrastes `bg-k-green` sur la landing (texte passé à 4.59:1) +
      `aria-label` sur l'input code du poste caisse.

## Refactoring opportuniste (règles au fil de l'eau)
Issues de l'audit maintenabilité (2026-07-21). À appliquer **quand on
retouche le fichier concerné**, jamais en big-bang :

- [ ] Découper `src/actions/pronostics.ts` (1480 l) par domaine :
      matches / leagues / player
- [ ] Découper `src/lib/resend.ts` (888 l) par domaine d'email
- [ ] Découper `poster-editor.tsx` (807 l) et `src/app/page.tsx` (990 l)
- [ ] Extraire les avatars de `src/lib/avatars.tsx` (786 l) en catalogue lazy
- [ ] Migrer progressivement `src/types/database.ts` (manuel) vers les types
      générés `database.generated.ts`
- [x] Ajouter axe-core aux tests Playwright (✅ 2026-07-21, volet 2 a11y)

**Reportés en arbitrage produit** :
- [ ] Undo/redo + autosave des éditeurs (selon feedback bêta)
- [ ] Dédup marketing app/site + prix partagés Stripe ↔ site + domaine
      canonique (avant ouverture publique)
- [x] Contraste automatique des segments de roue (✅ 2026-07-21, finalement
      livré au volet 2 a11y)

## V1.2 — Après le pilote (à prioriser selon retours)
- [x] Scan caméra du code gain côté staff (scanner en caisse : BarcodeDetector
      natif + repli jsQR, Permissions-Policy camera=(self), E2E dédié avec
      flux caméra simulé)
- [x] Multi-roues par campagne / planification horaire (roues multiples
      avec planning heures/jours via `selectActiveWheel` ; programmation
      de campagne ajoutée en V1.6)
- [x] Segments et automatisations sur la newsletter (segments livrés avec
      la file de travaux ; scénarios automatisés livrés en V1.6)
- [ ] Offres Stripe multiples (Pro : quotas, multi-établissements)
- [x] Captcha Turnstile obligatoire en production, sauf opt-out explicite
- [ ] Suppression/anonymisation RGPD self-service

## V2 — Croissance
- [x] Autres mécaniques de jeu (jackpot collectif — V1.9, ✅ 2026-07-23)
- [x] Rôles staff avec permissions réduites (caisse, campagnes et QR)
- [ ] API publique / intégrations (POS, CRM)
- [ ] Facturation à l'usage

## Blockers actuels
- Aucun. La production tourne (déploiement Vercel manuel via `vercel --prod`,
  plan Hobby : crons quotidiens uniquement) ; comptes Supabase / Stripe /
  Resend créés et variables d'environnement renseignées.
